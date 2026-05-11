"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  runTransaction,
  writeBatch,
} from "firebase/firestore";
import { Dices } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import { getAdminAccess } from "../../../lib/event-session";
import { useRedirectIfEventMissing } from "../../../lib/use-redirect-if-event-missing";
import { resolveEventFeatures } from "../../../lib/event-features";
import {
  DEFAULT_BINGO_SETTINGS,
  DEFAULT_BINGO_STATE,
  normalizeBingoSettings,
  normalizeBingoState,
  type BingoCardDoc,
  type BingoSettings,
  type BingoState,
} from "../../../lib/bingo-schema";

type Props = { eventId: string };

function pickRandomUndrawn(min: number, max: number, drawnSet: Set<number>): number | null {
  const pool: number[] = [];
  for (let n = min; n <= max; n += 1) {
    if (!drawnSet.has(n)) pool.push(n);
  }
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

export function AdminBingoClient({ eventId }: Props) {
  const router = useRouter();
  useRedirectIfEventMissing(eventId);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [eventTitle, setEventTitle] = useState("イベント");
  const [settings, setSettings] = useState<BingoSettings>(DEFAULT_BINGO_SETTINGS);
  const [state, setState] = useState<BingoState>(DEFAULT_BINGO_STATE);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<BingoCardDoc[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const statePathLabel = `events/${eventId}/bingoState/main`;

  useEffect(() => {
    setAllowed(getAdminAccess(eventId));
  }, [eventId]);

  useEffect(() => {
    if (allowed === false) router.replace(`/events/${eventId}/manage`);
  }, [allowed, eventId, router]);

  useEffect(() => {
    const unsubEvent = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { title?: string; features?: unknown };
      setEventTitle(String(data.title ?? "イベント"));
    });
    return () => unsubEvent();
  }, [eventId]);

  useEffect(() => {
    const initializeOnce = async () => {
      const settingsRef = doc(db, "events", eventId, "bingoSettings", "main");
      const stateRef = doc(db, "events", eventId, "bingoState", "main");
      const evRef = doc(db, "events", eventId);
      const evSnap = await getDoc(evRef);
      if (!evSnap.exists()) return;
      const evData = evSnap.data() as { features?: unknown };
      const f = resolveEventFeatures(evData.features);
      await setDoc(
        evRef,
        {
          features: {
            mission: f.mission,
            quiz: f.quiz,
            bingo: true,
            roulette: f.roulette,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, { ...DEFAULT_BINGO_SETTINGS, updatedAt: serverTimestamp() }, { merge: true });
      }
      const stateSnap = await getDoc(stateRef);
      if (!stateSnap.exists()) {
        await setDoc(stateRef, { ...DEFAULT_BINGO_STATE, updatedAt: serverTimestamp() }, { merge: true });
      }
    };
    void initializeOnce();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId, "bingoSettings", "main"), (snap) => {
      setSettings(normalizeBingoSettings(snap.exists() ? snap.data() : undefined));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId, "bingoState", "main"), (snap) => {
      const next = normalizeBingoState(snap.exists() ? snap.data() : undefined);
      console.log("[bingo-admin] onSnapshot state", {
        path: statePathLabel,
        currentNumber: next.currentNumber,
        drawnNumbers: next.drawnNumbers,
      });
      setState(next);
    });
    return () => unsub();
  }, [eventId, statePathLabel]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "events", eventId, "bingoCards"), (snap) => {
      const rows = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          participantId: String(raw.participantId ?? d.id),
          participantName: String(raw.participantName ?? "参加者"),
          gridSize: raw.gridSize === 5 ? 5 : 3,
          numbers: [],
          markedNumbers: [],
          bingoLines: typeof raw.bingoLines === "number" ? raw.bingoLines : 0,
          reachLines: typeof raw.reachLines === "number" ? raw.reachLines : 0,
          bingoAwarded: raw.bingoAwarded === true,
        } as BingoCardDoc;
      });
      setCards(rows);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "events", eventId, "participants"), (snap) => {
      setParticipantCount(snap.size);
    });
    return () => unsub();
  }, [eventId]);

  const drawnNewestFirst = useMemo(() => [...state.drawnNumbers].reverse(), [state.drawnNumbers]);
  const drawnSet = useMemo(() => new Set(state.drawnNumbers), [state.drawnNumbers]);

  const reachCount = useMemo(() => cards.filter((c) => c.reachLines > 0 && c.bingoLines === 0).length, [cards]);
  const bingoCount = useMemo(() => cards.filter((c) => c.bingoLines > 0).length, [cards]);

  const appendNumber = async (num: number, drawnBy: "admin" | "manual") => {
    const stateRef = doc(db, "events", eventId, "bingoState", "main");
    const savedDrawnNumbers = await runTransaction(db, async (tx) => {
      const snap = await tx.get(stateRef);
      const current = normalizeBingoState(snap.exists() ? snap.data() : undefined);
      const unique = Array.from(new Set([...current.drawnNumbers, num]));
      tx.set(
        stateRef,
        {
          currentNumber: num,
          drawnNumbers: unique,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return unique;
    });
    console.log("[bingo-admin] draw saved", {
      pickedNumber: num,
      path: statePathLabel,
      drawnNumbers: savedDrawnNumbers,
    });
    await addDoc(collection(db, "events", eventId, "bingoDrawLogs"), {
      number: num,
      drawnAt: serverTimestamp(),
      drawnBy,
    });
  };

  const drawNext = async () => {
    if (busy) return;
    const n = pickRandomUndrawn(settings.minNumber, settings.maxNumber, drawnSet);
    if (n === null) {
      window.alert("抽選できる番号がありません。");
      return;
    }
    setBusy(true);
    try {
      await appendNumber(n, "admin");
    } finally {
      setBusy(false);
    }
  };

  const pickManual = async (num: number) => {
    if (busy) return;
    if (num < settings.minNumber || num > settings.maxNumber) return;
    setBusy(true);
    try {
      await appendNumber(num, "manual");
    } finally {
      setBusy(false);
    }
  };

  const clearCards = async () => {
    const snap = await getDocs(collection(db, "events", eventId, "bingoCards"));
    if (snap.empty) return;
    let batch = writeBatch(db);
    let op = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      op += 1;
      if (op >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        op = 0;
      }
    }
    if (op > 0) await batch.commit();
  };

  const resetAll = async () => {
    if (busy) return;
    const ok = window.confirm("抽選をリセットします。参加者カードも再生成されます。よろしいですか？");
    if (!ok) return;
    setBusy(true);
    try {
      const stateRef = doc(db, "events", eventId, "bingoState", "main");
      await setDoc(
        stateRef,
        { ...DEFAULT_BINGO_STATE, updatedAt: serverTimestamp() },
        { merge: true },
      );
      await clearCards();
    } finally {
      setBusy(false);
    }
  };

  const changeGrid = async (nextSize: 3 | 5) => {
    if (busy) return;
    if (nextSize === settings.gridSize) return;
    let proceed = true;
    if (cards.length > 0) {
      proceed = window.confirm("変更するとカードを再生成します。続行しますか？");
    }
    if (!proceed) return;
    setBusy(true);
    try {
      const settingsRef = doc(db, "events", eventId, "bingoSettings", "main");
      const stateRef = doc(db, "events", eventId, "bingoState", "main");
      await setDoc(
        settingsRef,
        { gridSize: nextSize, updatedAt: serverTimestamp() },
        { merge: true },
      );
      if (cards.length > 0) {
        await setDoc(
          stateRef,
          { ...DEFAULT_BINGO_STATE, updatedAt: serverTimestamp() },
          { merge: true },
        );
        await clearCards();
      }
    } finally {
      setBusy(false);
    }
  };

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF7E8] to-[#FFE9E5] px-4 pb-10 pt-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold text-[#7C3AED]">{eventTitle}（運営）</p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#111827]">ビンゴ管理</h1>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">運営中</span>
          </div>
        </header>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-sm font-bold text-[#6B21A8]">✨ 現在の抽選番号 ✨</p>
          <div className="mx-auto mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-[#F3E8FF]">
            {typeof state.currentNumber === "number" ? (
              <span className="text-5xl font-extrabold text-[#7C3AED]">{state.currentNumber}</span>
            ) : (
              <span className="text-sm font-bold text-[#6B7280]">未抽選</span>
            )}
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">🎊 参加者に表示中！</p>
        </section>

        <button
          type="button"
          onClick={() => void drawNext()}
          disabled={busy}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-base font-bold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] disabled:opacity-50"
        >
          <Dices className="h-5 w-5" />
          つぎの番号を抽選する
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              const raw = window.prompt("抽選したい番号を入力してください（1〜100）");
              if (!raw) return;
              const n = Math.floor(Number(raw));
              if (!Number.isFinite(n)) return;
              void pickManual(n);
            }}
            className="rounded-xl border border-[#E9D5FF] bg-white px-3 py-3 text-sm font-bold text-[#7C3AED]"
          >
            番号を選択する
          </button>
          <button
            type="button"
            onClick={() => void resetAll()}
            className="rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-bold text-[#EF4444]"
          >
            抽選をリセット
          </button>
        </div>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#111827]">これまでに出た番号</h3>
            <span className="text-xs text-[#6B7280]">新しい順</span>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {drawnNewestFirst.length > 0 ? drawnNewestFirst.map((n, i) => (
              <span
                key={`${n}-${i}`}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-bold ${
                  i === 0 ? "bg-[#7C3AED] text-white" : "bg-[#F3E8FF] text-[#7C3AED]"
                }`}
              >
                {n}
              </span>
            )) : <span className="text-sm text-[#6B7280]">まだありません</span>}
          </div>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <h3 className="text-sm font-bold text-[#111827]">数字を選択して抽選（1〜100）</h3>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => {
              const isCurrent = state.currentNumber === n;
              const isDrawn = drawnSet.has(n);
              const outOfRange = n < settings.minNumber || n > settings.maxNumber;
              const cls = outOfRange
                ? "border-zinc-100 bg-zinc-50 text-zinc-300"
                : isCurrent
                  ? "border-[#6D28D9] bg-[#6D28D9] text-white"
                  : isDrawn
                    ? "border-[#A855F7] bg-[#F3E8FF] text-[#7C3AED]"
                    : "border-[#E5E7EB] bg-white text-[#111827]";
              return (
                <button
                  key={n}
                  type="button"
                  disabled={busy || outOfRange}
                  onClick={() => void pickManual(n)}
                  className={`rounded-lg border px-1 py-2 text-xs font-bold ${cls}`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-[#6B7280]">
            <span className="font-semibold text-[#7C3AED]">紫:</span> 抽選済み /{" "}
            <span className="font-semibold text-[#111827]">白:</span> 未抽選
          </p>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <h3 className="text-sm font-bold text-[#111827]">ビンゴ設定</h3>
          <p className="mt-2 text-xs text-[#6B7280]">数字の範囲: {settings.minNumber}〜{settings.maxNumber}</p>
          <p className="mt-1 text-xs text-[#6B7280]">中央マス: FREE（固定）</p>
          <div className="mt-3 inline-flex rounded-xl border border-[#E9D5FF] p-1">
            <button
              type="button"
              onClick={() => void changeGrid(3)}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${settings.gridSize === 3 ? "bg-[#7C3AED] text-white" : "text-[#7C3AED]"}`}
            >
              3×3
            </button>
            <button
              type="button"
              onClick={() => void changeGrid(5)}
              className={`rounded-lg px-4 py-2 text-sm font-bold ${settings.gridSize === 5 ? "bg-[#7C3AED] text-white" : "text-[#7C3AED]"}`}
            >
              5×5
            </button>
          </div>
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <h3 className="text-sm font-bold text-[#111827]">集計</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-zinc-50 p-3 text-center">
              <p className="text-[11px] text-[#6B7280]">参加者数</p>
              <p className="mt-1 text-lg font-bold text-[#111827]">{participantCount}人</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-center">
              <p className="text-[11px] text-amber-700">リーチ人数</p>
              <p className="mt-1 text-lg font-bold text-amber-700">{reachCount}人</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-[11px] text-emerald-700">ビンゴ人数</p>
              <p className="mt-1 text-lg font-bold text-emerald-700">{bingoCount}人</p>
            </div>
          </div>
        </section>

        <Link href={`/admin/${eventId}`} className="text-center text-sm font-semibold text-[#7C3AED] underline">
          運営ダッシュボードへ戻る
        </Link>
      </main>
    </div>
  );
}
