import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import {
  computeFinalRotationDeg,
  deterministicWeightedPick,
  hashSeed,
  normalizeRouletteSettings,
  normalizeRouletteState,
} from "./roulette-schema";

export type RouletteItemRow = {
  id: string;
  label: string;
  name: string;
  weight: number;
  active: boolean;
  order: number;
};

/** order フィールドで並べ替え（ルーレットのセグメント順と一致させる） */
export function sortRouletteItemsByOrder(rows: RouletteItemRow[]): RouletteItemRow[] {
  return [...rows].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ja"));
}

export async function startRouletteSpin(
  db: Firestore,
  eventId: string,
  by: "admin" | "participant",
): Promise<{ ok: boolean; reason?: string }> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  const settingsRef = doc(db, "events", eventId, "rouletteSettings", "main");
  try {
    await runTransaction(db, async (tx) => {
      const [stSnap, setSnap] = await Promise.all([tx.get(stateRef), tx.get(settingsRef)]);
      const st = normalizeRouletteState(stSnap.data());
      const settings = normalizeRouletteSettings(setSnap.data());
      if (st.status === "spinning") return;
      if (by === "participant" && settings.controlMode !== "participant") return;
      tx.set(
        stateRef,
        {
          status: "spinning",
          winnerItemId: null,
          winnerItemLabel: null,
          winnerItemName: null,
          startedAt: serverTimestamp(),
          finishedAt: null,
          spinNonce: st.spinNonce + 1,
          spinStartedBy: by,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
    return { ok: true };
  } catch (e) {
    console.error("[roulette] start spin failed", e);
    return { ok: false, reason: "start_failed" };
  }
}

export async function finalizeRouletteSpin(
  db: Firestore,
  eventId: string,
  itemsSorted: RouletteItemRow[],
): Promise<boolean> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  const settingsRef = doc(db, "events", eventId, "rouletteSettings", "main");

  const activeSorted = itemsSorted.filter((i) => i.active);
  const n = activeSorted.length;

  try {
    let deactivateItemId: string | null = null;
    let removeWinner = false;

    const committed = await runTransaction(db, async (tx) => {
      const stSnap = await tx.get(stateRef);
      const setSnap = await tx.get(settingsRef);
      const st = normalizeRouletteState(stSnap.data());
      const settings = normalizeRouletteSettings(setSnap.data());

      if (st.status !== "spinning" || !st.startedAt) return false;
      const startMs = st.startedAt.toMillis();
      if (Date.now() < startMs + settings.spinDurationMs - 40) return false;

      if (n <= 0) {
        tx.set(
          stateRef,
          {
            status: "finished",
            winnerItemId: null,
            winnerItemLabel: null,
            winnerItemName: null,
            currentRotation: st.currentRotation,
            finishedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        return true;
      }

      const exclude =
        settings.preventSameConsecutive ? st.lastResultItemId : null;
      const seed = hashSeed([eventId, startMs, st.spinNonce]);
      const pool = activeSorted.map((i) => ({
        id: i.id,
        weight: i.weight,
        active: true,
      }));
      const pickedId = deterministicWeightedPick(pool, seed, exclude);
      const winnerRow = activeSorted.find((i) => i.id === pickedId) ?? activeSorted[0];
      const winnerIndex = activeSorted.findIndex((i) => i.id === winnerRow.id);
      const fullSpins = 5 + (st.spinNonce % 3);
      const rotation = computeFinalRotationDeg(
        winnerIndex >= 0 ? winnerIndex : 0,
        n,
        fullSpins,
      );

      removeWinner = settings.removeWinnerAfterSpin;
      deactivateItemId = winnerRow.id;

      tx.set(
        stateRef,
        {
          status: "finished",
          winnerItemId: winnerRow.id,
          winnerItemLabel: winnerRow.label,
          winnerItemName: winnerRow.name,
          currentRotation: rotation,
          finishedAt: serverTimestamp(),
          lastResultItemId: winnerRow.id,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      const histNew = doc(collection(db, "events", eventId, "rouletteHistory"));
      tx.set(histNew, {
        itemId: winnerRow.id,
        label: winnerRow.label,
        name: winnerRow.name,
        spunBy: st.spinStartedBy ?? "admin",
        createdAt: serverTimestamp(),
      });

      return true;
    });
    if (committed && removeWinner && deactivateItemId) {
      try {
        await updateDoc(doc(db, "events", eventId, "rouletteItems", deactivateItemId), {
          active: false,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("[roulette] deactivate item skipped", e);
      }
    }
    return committed;
  } catch (e) {
    console.error("[roulette] finalize failed", e);
    return false;
  }
}

/** 結果のみリセット（履歴は残す） */
export async function resetRouletteResult(db: Firestore, eventId: string): Promise<void> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  await setDoc(
    stateRef,
    {
      status: "idle",
      winnerItemId: null,
      winnerItemLabel: null,
      winnerItemName: null,
      startedAt: null,
      finishedAt: null,
      spinStartedBy: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** 運営：手動で当選候補を指定して即完了 */
export async function forceRouletteWinner(
  db: Firestore,
  eventId: string,
  itemId: string,
  itemsSorted: RouletteItemRow[],
  settings: { removeWinnerAfterSpin: boolean },
): Promise<boolean> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  const activeSorted = itemsSorted.filter((i) => i.active);
  const n = activeSorted.length;
  const winnerRow = activeSorted.find((i) => i.id === itemId);
  if (!winnerRow || n <= 0) return false;
  const winnerIndex = activeSorted.findIndex((i) => i.id === itemId);
  const rotation = computeFinalRotationDeg(winnerIndex, n, 5);

  try {
    let wrote = false;
    await runTransaction(db, async (tx) => {
      const stSnap = await tx.get(stateRef);
      const st = normalizeRouletteState(stSnap.data());
      if (st.status === "spinning") return;

      wrote = true;
      tx.set(
        stateRef,
        {
          status: "finished",
          winnerItemId: winnerRow.id,
          winnerItemLabel: winnerRow.label,
          winnerItemName: winnerRow.name,
          currentRotation: rotation,
          startedAt: serverTimestamp(),
          finishedAt: serverTimestamp(),
          lastResultItemId: winnerRow.id,
          spinStartedBy: "admin",
          spinNonce: st.spinNonce + 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      const histNew = doc(collection(db, "events", eventId, "rouletteHistory"));
      tx.set(histNew, {
        itemId: winnerRow.id,
        label: winnerRow.label,
        name: winnerRow.name,
        spunBy: "admin",
        createdAt: serverTimestamp(),
      });
    });
    if (!wrote) return false;
    if (settings.removeWinnerAfterSpin && winnerRow.id) {
      try {
        await updateDoc(doc(db, "events", eventId, "rouletteItems", winnerRow.id), {
          active: false,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("[roulette] force winner deactivate skipped", e);
      }
    }
    return true;
  } catch (e) {
    console.error("[roulette] force winner failed", e);
    return false;
  }
}

export async function clearAllRouletteHistory(db: Firestore, eventId: string): Promise<void> {
  const { getDocs, deleteDoc } = await import("firebase/firestore");
  const snap = await getDocs(collection(db, "events", eventId, "rouletteHistory"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
