import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import {
  computeFinalRotationDeg,
  deterministicWeightedPick,
  hashSeed,
  normalizeRouletteSettings,
  normalizeRouletteState,
  type RouletteSettings,
  type RouletteState,
} from "./roulette-schema";

export type RouletteItemRow = {
  id: string;
  label: string;
  name: string;
  weight: number;
  active: boolean;
  order: number;
};

export const ROULETTE_MAX_ITEMS = 16;

export type RestoreRouletteItemReason =
  | "not_idle"
  | "already_restored"
  | "item_still_exists"
  | "duplicate_name"
  | "max_items"
  | "invalid_history"
  | "missing_text"
  | "restore_failed";

export type RestoreRouletteItemResult =
  | { ok: true }
  | { ok: false; reason: RestoreRouletteItemReason };

/** 同名判定用（name 優先、無ければ label） */
export function rouletteItemNameKey(name: string, label: string): string {
  const trimmedName = name.trim();
  if (trimmedName) return trimmedName;
  return label.trim();
}

export function mapRouletteItemDoc(id: string, raw: Record<string, unknown>): RouletteItemRow {
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : "",
    name: typeof raw.name === "string" ? raw.name : "",
    weight: typeof raw.weight === "number" ? raw.weight : 1,
    active: raw.active !== false,
    order: typeof raw.order === "number" ? raw.order : 0,
  };
}

function hasRouletteDisplayText(item: RouletteItemRow): boolean {
  return Boolean(item.name.trim() || item.label.trim());
}

/** order フィールドで並べ替え（ルーレットのセグメント順と一致させる） */
export function sortRouletteItemsByOrder(rows: RouletteItemRow[]): RouletteItemRow[] {
  return [...rows].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ja"));
}

/** 表示項目と抽選対象のインデックスを一致させる */
export function prepareRouletteSpinItems(rows: RouletteItemRow[]): RouletteItemRow[] {
  return sortRouletteItemsByOrder(rows).map((row) => ({ ...row, active: true }));
}

/**
 * finalizeRouletteSpin 内と同一の式で「保存される currentRotation」を算出する（演出用・書き込みなし）。
 * 抽選ロジック・確率は finalize と完全に同じ関数を使用する。
 */
export function predictFinalizeStoredRotationDeg(
  eventId: string,
  state: RouletteState,
  settings: RouletteSettings,
  itemsSorted: RouletteItemRow[],
): number | null {
  if (state.status !== "spinning" || !state.startedAt) return null;
  const activeSorted = itemsSorted.filter((i) => i.active);
  const n = activeSorted.length;
  if (n <= 0) return null;
  const startMs = state.startedAt.toMillis();
  const exclude = settings.preventSameConsecutive ? state.lastResultItemId : null;
  const seed = hashSeed([eventId, startMs, state.spinNonce]);
  const pool = activeSorted.map((i) => ({
    id: i.id,
    weight: i.weight,
    active: true,
  }));
  const pickedId = deterministicWeightedPick(pool, seed, exclude);
  const winnerRow = activeSorted.find((i) => i.id === pickedId) ?? activeSorted[0];
  const winnerIndex = activeSorted.findIndex((i) => i.id === winnerRow.id);
  const fullSpins = 5 + (state.spinNonce % 3);
  return computeFinalRotationDeg(
    winnerIndex >= 0 ? winnerIndex : 0,
    n,
    fullSpins,
  );
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
    return committed;
  } catch (e) {
    console.error("[roulette] finalize failed", e);
    return false;
  }
}

/**
 * 当選結果を確認して idle に戻す。
 * removeWinnerAfterSpin が ON のときのみ、当選景品をルーレット項目から削除する。
 */
export async function acknowledgeRouletteResult(
  db: Firestore,
  eventId: string,
  removeWinnerAfterSpin: boolean,
): Promise<boolean> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  try {
    const stSnap = await getDoc(stateRef);
    const st = normalizeRouletteState(stSnap.data());
    if (st.status !== "finished") return false;

    const winnerItemId = st.winnerItemId;
    await resetRouletteResult(db, eventId);

    if (removeWinnerAfterSpin && winnerItemId) {
      try {
        await deleteDoc(doc(db, "events", eventId, "rouletteItems", winnerItemId));
      } catch (e) {
        console.warn("[roulette] acknowledge remove item skipped", e);
      }
    }
    return true;
  } catch (e) {
    console.error("[roulette] acknowledge failed", e);
    return false;
  }
}

/** 結果のみリセット（履歴は残す・景品除外は行わない） */
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
): Promise<boolean> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  const pool = prepareRouletteSpinItems(itemsSorted);
  const n = pool.length;
  const winnerRow = pool.find((i) => i.id === itemId);
  if (!winnerRow || n <= 0) return false;
  const winnerIndex = pool.findIndex((i) => i.id === itemId);
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
    return wrote;
  } catch (e) {
    console.error("[roulette] force winner failed", e);
    return false;
  }
}

export async function clearAllRouletteHistory(db: Firestore, eventId: string): Promise<number> {
  const snap = await getDocs(collection(db, "events", eventId, "rouletteHistory"));
  if (snap.empty) return 0;
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

const RESTORE_ERROR_CODES = new Set<RestoreRouletteItemReason>([
  "not_idle",
  "already_restored",
  "item_still_exists",
  "duplicate_name",
  "max_items",
  "invalid_history",
  "missing_text",
]);

/**
 * 抽選履歴から除外済み景品をルーレットに復元する（運営専用）。
 * - 待機中のみ
 * - 履歴の itemId が rouletteItems に無いときのみ
 * - 同名景品がある場合は拒否
 */
export async function restoreRouletteItemFromHistory(
  db: Firestore,
  eventId: string,
  historyId: string,
): Promise<RestoreRouletteItemResult> {
  const stateRef = doc(db, "events", eventId, "rouletteState", "main");
  const histRef = doc(db, "events", eventId, "rouletteHistory", historyId);
  const itemsCol = collection(db, "events", eventId, "rouletteItems");

  try {
    const preItemsSnap = await getDocs(itemsCol);
    const itemRefs = preItemsSnap.docs.map((d) => d.ref);

    await runTransaction(db, async (tx) => {
      const [stSnap, histSnap, ...itemSnaps] = await Promise.all([
        tx.get(stateRef),
        tx.get(histRef),
        ...itemRefs.map((ref) => tx.get(ref)),
      ]);

      const st = normalizeRouletteState(stSnap.data());
      if (st.status !== "idle") throw new Error("not_idle");

      if (!histSnap.exists()) throw new Error("invalid_history");
      const h = histSnap.data() as Record<string, unknown>;
      if (h.restored === true || h.restoredAt) throw new Error("already_restored");

      const sourceItemId = typeof h.itemId === "string" ? h.itemId : "";
      const label = typeof h.label === "string" ? h.label : "";
      const name = typeof h.name === "string" ? h.name : "";
      if (!name.trim() && !label.trim()) throw new Error("missing_text");

      const rows = itemSnaps
        .filter((snap) => snap.exists())
        .map((snap) => mapRouletteItemDoc(snap.id, snap.data() as Record<string, unknown>));
      const displayRows = sortRouletteItemsByOrder(rows).filter(hasRouletteDisplayText);
      if (displayRows.length >= ROULETTE_MAX_ITEMS) throw new Error("max_items");

      if (sourceItemId && rows.some((row) => row.id === sourceItemId)) {
        throw new Error("item_still_exists");
      }

      const restoreKey = rouletteItemNameKey(name, label);
      if (!restoreKey) throw new Error("missing_text");
      const duplicated = displayRows.some(
        (row) => rouletteItemNameKey(row.name, row.label) === restoreKey,
      );
      if (duplicated) throw new Error("duplicate_name");

      const maxOrder = rows.reduce((m, r) => Math.max(m, r.order), 0);
      const newRef = doc(collection(db, "events", eventId, "rouletteItems"));
      tx.set(newRef, {
        label: label.trim(),
        name: name.trim(),
        weight: 1,
        order: maxOrder + 1,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        restoredFromHistoryId: historyId,
      });

      tx.update(histRef, {
        restored: true,
        restoredAt: serverTimestamp(),
        restoredItemId: newRef.id,
      });
    });
    return { ok: true };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (RESTORE_ERROR_CODES.has(code as RestoreRouletteItemReason)) {
      return { ok: false, reason: code as RestoreRouletteItemReason };
    }
    console.error("[roulette] restore from history failed", e);
    return { ok: false, reason: "restore_failed" };
  }
}
