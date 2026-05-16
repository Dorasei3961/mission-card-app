"use client";

import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { clearEventScopedStorage } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import {
  normalizeRouletteSettings,
  normalizeRouletteState,
  DEFAULT_ROULETTE_SETTINGS,
  DEFAULT_ROULETTE_STATE,
  clockwiseEndRotationForSpin,
  clockwiseRotationToMatchStoredAngle,
  ROULETTE_SPIN_TRANSITION_EASING,
} from "../../../lib/roulette-schema";
import {
  finalizeRouletteSpin,
  predictFinalizeStoredRotationDeg,
  sortRouletteItemsByOrder,
  startRouletteSpin,
  type RouletteItemRow,
} from "../../../lib/roulette-operations";
import { PARTICIPANT_MAIN_BOTTOM_PADDING } from "../../../lib/participant-ui";
import { recordParticipantMainPage } from "../../../lib/participant-last-page";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { useParticipantRankingLink } from "../use-participant-ranking-link";
import { rouletteSegmentDisplayText, rouletteWinnerDisplayText } from "../../../lib/roulette-display";
import { ConfettiBurst, RouletteWheelView } from "./roulette-wheel-view";

type Props = { eventId: string };

const ROULETTE_GRADIENT = "min-h-screen bg-gradient-to-b from-[#FFF7E8] to-[#FFE9E5]";

function formatTime(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(ts: Timestamp | undefined): string {
  if (!ts) return "—";
  const d = ts.toDate();
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function medalForIndex(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "・";
}

export function ParticipantRouletteClient({ eventId }: Props) {
  const router = useRouter();
  const showRankingLink = useParticipantRankingLink(eventId);
  const [eventTitle, setEventTitle] = useState("イベント");
  const [eventActive, setEventActive] = useState(true);
  const [featureOn, setFeatureOn] = useState(false);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_ROULETTE_SETTINGS }));
  const [state, setState] = useState(() => ({ ...DEFAULT_ROULETTE_STATE }));
  const [items, setItems] = useState<RouletteItemRow[]>([]);
  const [history, setHistory] = useState<
    { id: string; label: string; name: string; createdAt?: Timestamp; spunBy: string }[]
  >([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [spinBusy, setSpinBusy] = useState(false);
  const itemsRef = useRef<RouletteItemRow[]>([]);
  const [visualRotation, setVisualRotation] = useState(0);
  /** この spinNonce で既に回転角を同期済み（通常スピン or 手動確定のどちらか一度だけ） */
  const rotationSyncedNonceRef = useRef<number | null>(null);
  /** 手動当選など spinning を経由しない完了時の ease-out 用 */
  const [finishEaseMs, setFinishEaseMs] = useState(0);

  itemsRef.current = items;

  useEffect(() => {
    recordParticipantMainPage(eventId, `/events/${eventId}/roulette`);
  }, [eventId]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) await signInAnonymously(auth);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        clearEventScopedStorage(eventId);
        router.replace("/");
        return;
      }
      const data = snap.data() as { title?: string; status?: string; features?: unknown };
      setEventTitle(String(data.title ?? "イベント"));
      setEventActive(data.status !== "closed");
      setFeatureOn(resolveEventFeatures(data.features).roulette);
    });
    return () => unsub();
  }, [eventId, router]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId, "rouletteSettings", "main"), (snap) => {
      setSettings(normalizeRouletteSettings(snap.data()));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId, "rouletteState", "main"), (snap) => {
      setState(normalizeRouletteState(snap.data()));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const coll = collection(db, "events", eventId, "rouletteItems");
    const unsub = onSnapshot(coll, (snap) => {
      const rows: RouletteItemRow[] = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          label: typeof raw.label === "string" ? raw.label : "",
          name: typeof raw.name === "string" ? raw.name : "",
          weight: typeof raw.weight === "number" ? raw.weight : 1,
          active: raw.active !== false,
          order: typeof raw.order === "number" ? raw.order : 0,
        };
      });
      setItems(sortRouletteItemsByOrder(rows));
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const q = query(
      collection(db, "events", eventId, "rouletteHistory"),
      orderBy("createdAt", "desc"),
      limit(80),
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          label: String(raw.label ?? ""),
          name: String(raw.name ?? ""),
          createdAt: raw.createdAt as Timestamp | undefined,
          spunBy: String(raw.spunBy ?? ""),
        };
      });
      setHistory(rows);
    });
    return () => unsub();
  }, [eventId]);

  const activeSorted = useMemo(() => items.filter((i) => i.active), [items]);

  /** アイドル時のみリセット（transition なし）。次回スピンのために同期フラグ解除 */
  useEffect(() => {
    if (state.status !== "idle") return;
    setVisualRotation(0);
    rotationSyncedNonceRef.current = null;
    setFinishEaseMs(0);
  }, [state.status]);

  /**
   * spinning に入ったら finalize と同じ抽選・角度式で終端角を1回だけ算出し、
   * 1本の ease-out transition でそこまで回す（二段トランジションによる疑似再加速を防ぐ）
   */
  useEffect(() => {
    if (state.status !== "spinning" || !state.startedAt) return;
    if (rotationSyncedNonceRef.current === state.spinNonce) return;
    const sorted = sortRouletteItemsByOrder(itemsRef.current.filter((i) => i.active));
    const storedDeg = predictFinalizeStoredRotationDeg(eventId, state, settings, sorted);
    if (storedDeg === null) {
      rotationSyncedNonceRef.current = state.spinNonce;
      return;
    }
    rotationSyncedNonceRef.current = state.spinNonce;
    setFinishEaseMs(0);
    setVisualRotation((prev) => clockwiseEndRotationForSpin(prev, storedDeg, 5));
  }, [eventId, state, settings]);

  /** 手動当選など spinning を経由しない finished のみ、1回だけ時計回りで補正 */
  useEffect(() => {
    if (state.status !== "finished" || typeof state.currentRotation !== "number") return;
    if (rotationSyncedNonceRef.current === state.spinNonce) return;
    rotationSyncedNonceRef.current = state.spinNonce;
    setFinishEaseMs(settings.spinDurationMs);
    setVisualRotation((prev) =>
      clockwiseRotationToMatchStoredAngle(prev, state.currentRotation as number),
    );
  }, [eventId, state.status, state.currentRotation, state.spinNonce, settings.spinDurationMs]);

  useEffect(() => {
    if (finishEaseMs <= 0) return;
    const t = window.setTimeout(() => setFinishEaseMs(0), finishEaseMs);
    return () => clearTimeout(t);
  }, [finishEaseMs]);

  useEffect(() => {
    if (state.status !== "spinning") return;
    const started = state.startedAt;
    if (!started) return;
    const ms = settings.spinDurationMs;
    const deadline = started.toMillis() + ms;
    const delay = Math.max(0, deadline - Date.now());

    const handle = window.setTimeout(async () => {
      const sorted = sortRouletteItemsByOrder(itemsRef.current.filter((i) => i.active));
      await finalizeRouletteSpin(db, eventId, sorted);
    }, delay);

    return () => clearTimeout(handle);
  }, [eventId, state.status, state.startedAt, state.spinNonce, settings.spinDurationMs]);

  const winnerFullText = useMemo(
    () => rouletteWinnerDisplayText(state.winnerItemLabel, state.winnerItemName),
    [state.winnerItemLabel, state.winnerItemName],
  );

  const centerMainText = useMemo(() => {
    if (state.status === "idle") return "START";
    if (state.status === "spinning") return "…";
    if (state.status === "finished") {
      const winner = activeSorted.find((i) => i.id === state.winnerItemId);
      if (winner) return rouletteSegmentDisplayText(winner, 8);
    }
    return "結果";
  }, [state.status, state.winnerItemId, activeSorted]);

  const statusSub = useMemo(() => {
    if (state.status === "idle") return "運営の開始を待っています";
    if (state.status === "spinning") return "運営がルーレットを開始しました！";
    return "結果が発表されました！";
  }, [state.status]);

  const participantCanSpin =
    settings.controlMode === "participant" &&
    featureOn &&
    eventActive &&
    state.status === "idle";

  const handleParticipantSpin = async () => {
    if (!participantCanSpin || spinBusy) return;
    setSpinBusy(true);
    try {
      await startRouletteSpin(db, eventId, "participant");
    } finally {
      setSpinBusy(false);
    }
  };

  const historyPreview = history.slice(0, 3);

  if (!featureOn) {
    return (
      <div className={`${ROULETTE_GRADIENT} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
        <main className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
            この機能は現在利用できません。運営が有効化するまでお待ちください。
          </div>
        </main>
        <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
      </div>
    );
  }

  return (
    <div className={`${ROULETTE_GRADIENT} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="relative mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-[#111827]">{eventTitle}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                eventActive
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                  : "bg-zinc-100 text-[#6B7280] ring-1 ring-zinc-200"
              }`}
            >
              {eventActive ? "開催中" : "終了"}
            </span>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[18px] border border-[#E9D5FF] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <ConfettiBurst active={state.status === "finished"} />
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A78BFA]">ルーレット</p>
          <h2 className="mt-1 text-xl font-black text-[#111827]">{settings.name}</h2>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">{statusSub}</p>

          <div className="mt-6 flex justify-center">
            <RouletteWheelView
              activeItems={activeSorted}
              rotationDeg={visualRotation}
              transitionMs={
                state.status === "spinning"
                  ? settings.spinDurationMs
                  : finishEaseMs > 0
                    ? finishEaseMs
                    : 0
              }
              transitionEasing={ROULETTE_SPIN_TRANSITION_EASING}
              centerText={centerMainText}
            />
          </div>

          {state.status === "idle" ? (
            <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-4">
              <p className="text-center text-sm font-bold text-[#6D28D9]">
                {settings.controlMode === "participant"
                  ? "ここからルーレットを開始できます"
                  : "運営の開始を待っています"}
              </p>
              <p className="mt-2 text-center text-xs leading-relaxed text-[#6B7280]">
                {settings.controlMode === "participant"
                  ? "ボタンからルーレットを回せます"
                  : "ルーレットの開始をお待ちください"}
              </p>
            </div>
          ) : null}

          {state.status === "spinning" ? (
            <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-4">
              <p className="text-center text-sm font-bold text-[#6D28D9]">ルーレット回転中！</p>
              <p className="mt-2 text-center text-xs leading-relaxed text-[#6B7280]">
                結果がでるまでお待ちください
              </p>
            </div>
          ) : null}

          {state.status === "finished" ? (
            <div className="mt-6 space-y-4">
              <div className="text-center">
                <p className="text-3xl font-black text-[#FBBF24] drop-shadow-sm">あたり！</p>
                <p className="mt-3 text-lg font-bold leading-snug text-[#111827] sm:text-xl">
                  {winnerFullText}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                <p className="text-center text-sm font-bold text-emerald-800">おめでとうございます！</p>
                <p className="mt-2 text-center text-xs leading-relaxed text-emerald-900/90">
                  運営からの案内をお待ちください
                </p>
              </div>
            </div>
          ) : null}

          {settings.controlMode === "participant" && featureOn ? (
            <button
              type="button"
              disabled={!participantCanSpin || spinBusy}
              onClick={() => void handleParticipantSpin()}
              className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#9333EA] text-base font-bold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] disabled:opacity-45 touch-manipulation"
            >
              ルーレットを回す！
            </button>
          ) : settings.controlMode === "admin" ? (
            <p className="mt-6 text-center text-xs font-semibold text-[#6B7280]">
              運営の開始を待っています
            </p>
          ) : null}
        </section>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#111827]">これまでの結果</h3>
            <span className="text-[11px] font-semibold text-[#6B7280]">新しい順</span>
          </div>
          <ul className="mt-3 space-y-2">
            {historyPreview.length === 0 ? (
              <li className="text-sm text-[#6B7280]">まだ結果がありません</li>
            ) : (
              historyPreview.map((h, idx) => (
                <li key={h.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span>{medalForIndex(idx)}</span>
                  <span className="font-bold text-[#111827]">{h.label}</span>
                  <span className="text-[#6B7280]">{h.name}</span>
                  <span className="ml-auto text-xs text-[#9CA3AF]">{formatTime(h.createdAt)}</span>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => setHistoryExpanded(true)}
            className="mt-4 w-full rounded-xl border border-[#E9D5FF] bg-violet-50/50 py-3 text-sm font-bold text-[#7C3AED] touch-manipulation"
          >
            もっと見る
          </button>
        </section>
      </main>

      {historyExpanded ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[min(80vh,560px)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#E9D5FF] bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-[#111827]">これまでの結果</h3>
              <button
                type="button"
                className="rounded-lg px-3 py-1 text-sm font-semibold text-[#7C3AED]"
                onClick={() => setHistoryExpanded(false)}
              >
                閉じる
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {history.map((h, idx) => (
                <li key={h.id} className="border-b border-zinc-100 pb-3 text-sm last:border-0">
                  <div className="flex items-center gap-2">
                    <span>{medalForIndex(idx)}</span>
                    <span className="font-bold">{h.label}</span>
                    <span className="text-[#6B7280]">{h.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#9CA3AF]">{formatDateTime(h.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
