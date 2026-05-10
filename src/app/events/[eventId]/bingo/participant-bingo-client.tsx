"use client";

import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Check, Crown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { getEventSession, setEventSession } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import {
  buildBingoLines,
  centerIndex,
  DEFAULT_BINGO_SETTINGS,
  DEFAULT_BINGO_STATE,
  generateBingoCardNumbers,
  normalizeBingoSettings,
  normalizeBingoState,
  type BingoCellValue,
  type BingoCardDoc,
  type BingoSettings,
  type BingoState,
} from "../../../lib/bingo-schema";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../../lib/participant-ui";
import { recordParticipantMainPage } from "../../../lib/participant-last-page";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { useParticipantRankingLink } from "../use-participant-ranking-link";

type Props = { eventId: string };

type EvalResult = {
  markedNumbers: number[];
  hitIndices: Set<number>;
  reachLines: number;
  bingoLines: number;
  reachTargetIndices: Set<number>;
  bingoIndices: Set<number>;
};

function evaluateCard(numbers: BingoCellValue[], gridSize: 3 | 5, drawnNumbers: number[]): EvalResult {
  const drawn = new Set(drawnNumbers);
  const center = centerIndex(gridSize);
  const hitIndices = new Set<number>([center]);
  const markedNumbers: number[] = [];
  numbers.forEach((v, i) => {
    if (typeof v === "number" && drawn.has(v)) {
      hitIndices.add(i);
      markedNumbers.push(v);
    }
  });
  const lines = buildBingoLines(gridSize);
  let reachLines = 0;
  let bingoLines = 0;
  const reachTargetIndices = new Set<number>();
  const bingoIndices = new Set<number>();
  for (const line of lines) {
    let marked = 0;
    let lastMiss = -1;
    for (const idx of line) {
      if (hitIndices.has(idx)) marked += 1;
      else lastMiss = idx;
    }
    if (marked === gridSize) {
      bingoLines += 1;
      line.forEach((idx) => bingoIndices.add(idx));
      continue;
    }
    if (marked === gridSize - 1 && lastMiss >= 0) {
      reachLines += 1;
      reachTargetIndices.add(lastMiss);
    }
  }
  return {
    markedNumbers: markedNumbers.sort((a, b) => a - b),
    hitIndices,
    reachLines,
    bingoLines,
    reachTargetIndices,
    bingoIndices,
  };
}

export function ParticipantBingoClient({ eventId }: Props) {
  const showRankingLink = useParticipantRankingLink(eventId);
  const [ready, setReady] = useState(false);
  const [eventTitle, setEventTitle] = useState("イベント");
  const [eventClosed, setEventClosed] = useState(false);
  const [bingoFeatureEnabled, setBingoFeatureEnabled] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [authUid, setAuthUid] = useState("");
  const [settings, setSettings] = useState<BingoSettings>(DEFAULT_BINGO_SETTINGS);
  const [state, setState] = useState<BingoState>(DEFAULT_BINGO_STATE);
  const [card, setCard] = useState<BingoCardDoc | null>(null);
  const [error, setError] = useState("");
  const [awardMsg, setAwardMsg] = useState("");

  useEffect(() => {
    recordParticipantMainPage(eventId, `/events/${eventId}/bingo`);
  }, [eventId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      setAuthUid(user.uid);
      try {
        const evRef = doc(db, "events", eventId);
        const evSnap = await getDoc(evRef);
        if (!evSnap.exists()) {
          setError("イベントが見つかりません。");
          setReady(true);
          return;
        }
        const ev = evSnap.data() as { title?: string; status?: string; features?: unknown };
        setEventTitle(String(ev.title ?? "イベント"));
        setEventClosed(ev.status === "closed");
        const featureResolved = resolveEventFeatures(ev.features);
        setBingoFeatureEnabled(featureResolved.bingo);

        const session = getEventSession();
        const pId = session && session.eventId === eventId && session.uid ? session.uid : user.uid;
        const partSnap = await getDoc(doc(db, "events", eventId, "participants", pId));
        if (!partSnap.exists()) {
          setError("このイベントに参加していません。参加画面から入り直してください。");
          setReady(true);
          return;
        }
        const pName = String((partSnap.data() as { name?: unknown }).name ?? "").trim();
        setParticipantId(pId);
        setParticipantName(pName || "参加者");
        setEventSession({ eventId, participantName: pName || "参加者", uid: pId });

        const settingsRef = doc(db, "events", eventId, "bingoSettings", "main");
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
          await setDoc(settingsRef, { ...DEFAULT_BINGO_SETTINGS, updatedAt: serverTimestamp() }, { merge: true });
        }
        const stateRef = doc(db, "events", eventId, "bingoState", "main");
        const stateSnap = await getDoc(stateRef);
        if (!stateSnap.exists()) {
          await setDoc(stateRef, { ...DEFAULT_BINGO_STATE, updatedAt: serverTimestamp() }, { merge: true });
        }
      } catch (e) {
        console.error(e);
        setError("初期化に失敗しました。");
      } finally {
        setReady(true);
      }
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!ready) return;
    const unsubEvent = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) return;
      const ev = snap.data() as { title?: string; status?: string; features?: unknown };
      setEventTitle(String(ev.title ?? "イベント"));
      setEventClosed(ev.status === "closed");
      setBingoFeatureEnabled(resolveEventFeatures(ev.features).bingo);
    });
    return () => unsubEvent();
  }, [eventId, ready]);

  useEffect(() => {
    if (!ready) return;
    const settingsRef = doc(db, "events", eventId, "bingoSettings", "main");
    const unsub = onSnapshot(settingsRef, (snap) => {
      setSettings(normalizeBingoSettings(snap.exists() ? snap.data() : undefined));
    });
    return () => unsub();
  }, [eventId, ready]);

  useEffect(() => {
    if (!ready) return;
    const stateRef = doc(db, "events", eventId, "bingoState", "main");
    const unsub = onSnapshot(stateRef, (snap) => {
      setState(normalizeBingoState(snap.exists() ? snap.data() : undefined));
    });
    return () => unsub();
  }, [eventId, ready]);

  useEffect(() => {
    if (!participantId) return;
    const cardRef = doc(db, "events", eventId, "bingoCards", participantId);
    const unsub = onSnapshot(cardRef, async (snap) => {
      if (!snap.exists()) {
        const createdNumbers = generateBingoCardNumbers(
          settings.gridSize,
          settings.minNumber,
          settings.maxNumber,
        );
        const initialEval = evaluateCard(createdNumbers, settings.gridSize, state.drawnNumbers);
        const base: Omit<BingoCardDoc, "createdAt" | "updatedAt"> = {
          participantId,
          participantName: participantName || "参加者",
          gridSize: settings.gridSize,
          numbers: createdNumbers,
          markedNumbers: initialEval.markedNumbers,
          bingoLines: initialEval.bingoLines,
          reachLines: initialEval.reachLines,
          bingoAwarded: false,
        };
        await setDoc(
          cardRef,
          {
            ...base,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        setCard(base);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      const normalized: BingoCardDoc = {
        participantId: String(raw.participantId ?? participantId),
        participantName: String(raw.participantName ?? participantName ?? "参加者"),
        gridSize: raw.gridSize === 5 ? 5 : 3,
        numbers: Array.isArray(raw.numbers)
          ? raw.numbers.map((v) => (v === "FREE" ? "FREE" : Number(v))) as BingoCellValue[]
          : [],
        markedNumbers: Array.isArray(raw.markedNumbers)
          ? raw.markedNumbers.map((v) => Number(v)).filter((v) => Number.isFinite(v))
          : [],
        bingoLines: typeof raw.bingoLines === "number" ? Math.max(0, Math.floor(raw.bingoLines)) : 0,
        reachLines: typeof raw.reachLines === "number" ? Math.max(0, Math.floor(raw.reachLines)) : 0,
        bingoAwarded: raw.bingoAwarded === true,
      };
      setCard(normalized);
    });
    return () => unsub();
  }, [eventId, participantId, participantName, settings.gridSize, settings.maxNumber, settings.minNumber, state.drawnNumbers]);

  const evalResult = useMemo(() => {
    if (!card || card.numbers.length === 0) return null;
    return evaluateCard(card.numbers, card.gridSize, state.drawnNumbers);
  }, [card, state.drawnNumbers]);

  useEffect(() => {
    if (!card || !evalResult || !participantId) return;
    const needsWrite =
      card.bingoLines !== evalResult.bingoLines ||
      card.reachLines !== evalResult.reachLines ||
      JSON.stringify(card.markedNumbers) !== JSON.stringify(evalResult.markedNumbers);
    if (!needsWrite) return;
    void setDoc(
      doc(db, "events", eventId, "bingoCards", participantId),
      {
        markedNumbers: evalResult.markedNumbers,
        bingoLines: evalResult.bingoLines,
        reachLines: evalResult.reachLines,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }, [card, evalResult, eventId, participantId]);

  useEffect(() => {
    const award = async () => {
      if (!card || !evalResult || !participantId || !authUid) return;
      if (evalResult.bingoLines <= 0 || card.bingoAwarded) return;
      const point = settings.bingoPoint > 0 ? settings.bingoPoint : 100;
      const cardRef = doc(db, "events", eventId, "bingoCards", participantId);
      const participantRef = doc(db, "events", eventId, "participants", participantId);
      const userRef = doc(db, "users", authUid);
      const awarded = await runTransaction(db, async (tx) => {
        const cardSnap = await tx.get(cardRef);
        if (!cardSnap.exists()) return false;
        const currentAwarded = cardSnap.data().bingoAwarded === true;
        if (currentAwarded) return false;
        tx.set(
          cardRef,
          { bingoAwarded: true, updatedAt: serverTimestamp() },
          { merge: true },
        );
        tx.set(
          participantRef,
          {
            bingoPoints: increment(point),
            totalPoints: increment(point),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        tx.set(userRef, { totalPoints: increment(point), updatedAt: serverTimestamp() }, { merge: true });
        return true;
      });
      if (awarded) {
        await addDoc(collection(db, "events", eventId, "pointLogs"), {
          uid: participantId,
          participantName: participantName || "参加者",
          type: "bingo",
          point,
          reason: "ビンゴ達成",
          createdAt: serverTimestamp(),
          createdBy: participantId,
        });
        setAwardMsg(`🎉 BINGO達成！ +${point} pt`);
      }
    };
    void award();
  }, [authUid, card, evalResult, eventId, participantId, participantName, settings.bingoPoint]);

  const drawnNewestFirst = useMemo(() => [...state.drawnNumbers].reverse(), [state.drawnNumbers]);

  const gridTemplate = card?.gridSize === 5 ? "grid-cols-5" : "grid-cols-3";
  const cellSize = card?.gridSize === 5 ? "h-14 text-base" : "h-20 text-xl";

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-[#111827]">{eventTitle}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                eventClosed ? "bg-zinc-100 text-[#6B7280]" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {eventClosed ? "終了" : "開催中"}
            </span>
          </div>
        </header>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-sm font-bold text-[#6B21A8]">✨ 現在の抽選番号 ✨</p>
          <div className="mx-auto mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-[#F3E8FF]">
            {typeof state.currentNumber === "number" ? (
              <span className="text-5xl font-extrabold text-[#7C3AED]">{state.currentNumber}</span>
            ) : (
              <span className="px-3 text-sm font-bold text-[#6B7280]">まだ抽選されていません</span>
            )}
          </div>
          <p className="mt-3 text-xs text-[#6B7280]">次の抽選をお待ちください</p>
        </section>

        {!bingoFeatureEnabled ? (
          <section className="rounded-[18px] border border-zinc-200 bg-white p-4 text-sm text-[#6B7280] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            ビンゴ機能はまだ有効化されていません。
          </section>
        ) : null}

        {error ? (
          <section className="rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm font-semibold text-[#EF4444]">
            {error}
          </section>
        ) : null}

        {card && evalResult ? (
          <>
            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <h2 className="text-base font-bold text-[#111827]">
                あなたのビンゴカード（{card.gridSize}×{card.gridSize}）
              </h2>
              <div className={`mt-4 grid ${gridTemplate} gap-2`}>
                {card.numbers.map((value, idx) => {
                  const isFree = value === "FREE";
                  const isHit = evalResult.hitIndices.has(idx);
                  const isReachTarget = evalResult.reachTargetIndices.has(idx) && !isHit;
                  const isBingoCell = evalResult.bingoIndices.has(idx);
                  const className = isBingoCell
                    ? "border-[#22C55E] bg-[#DCFCE7] text-[#166534]"
                    : isReachTarget
                      ? "border-[#F59E0B] bg-[#FEF3C7] text-[#92400E]"
                      : isHit
                        ? "border-[#A855F7] bg-[#F3E8FF] text-[#7C3AED]"
                        : "border-[#E5E7EB] bg-white text-[#111827]";
                  return (
                    <div
                      key={`${idx}-${String(value)}`}
                      className={`relative flex ${cellSize} items-center justify-center rounded-xl border-2 font-bold shadow-sm ${className}`}
                    >
                      {isFree ? "FREE" : value}
                      {isHit && !isFree ? (
                        <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#7C3AED] text-white">
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs text-[#6B7280]">
                <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-[#A855F7]" />当たり</span>
                <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-[#FBBF24]" />リーチ</span>
                <span className="inline-flex items-center gap-1"><Crown className="h-3.5 w-3.5 text-[#22C55E]" />ビンゴ！</span>
              </div>
            </section>

            <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#111827]">これまでに出た番号</h3>
                <span className="text-xs font-semibold text-[#6B7280]">新しい順</span>
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

            {evalResult.bingoLines > 0 ? (
              <section className="rounded-[18px] border border-green-200 bg-green-50 p-4 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                <p className="text-xl font-extrabold text-[#22C55E]">🎉 BINGO！ 🎊</p>
                <p className="mt-1 text-sm font-semibold text-green-700">{awardMsg || "ライン成立中です！"}</p>
              </section>
            ) : evalResult.reachLines > 0 ? (
              <section className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                <p className="text-sm font-bold text-amber-900">🏆 リーチまであと <span className="text-2xl text-[#F59E0B]">1</span> マス！</p>
              </section>
            ) : null}
          </>
        ) : null}
      </main>

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
