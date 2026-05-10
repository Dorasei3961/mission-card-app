"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { HelpCircle, LayoutGrid, Sparkles, Target } from "lucide-react";
import { auth, db } from "../../../lib/firebase";
import { getEventSession } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../../lib/participant-ui";
import { recordParticipantMainPage } from "../../../lib/participant-last-page";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { useParticipantRankingLink } from "../use-participant-ranking-link";

type Props = { eventId: string };

/** URL は参加者経由のみ ?from=admin を付ける。未指定・それ以外は参加者モード */
function readFromAdminFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("from");
  return v === "admin";
}

export function EventFeaturesClient({ eventId }: Props) {
  const router = useRouter();
  const [eventTitle, setEventTitle] = useState("イベント");
  const [eventActive, setEventActive] = useState(true);
  const [features, setFeatures] = useState(resolveEventFeatures(undefined));
  const [fromAdmin, setFromAdmin] = useState(false);
  const [quizTotalCount, setQuizTotalCount] = useState(0);
  const [missionDone, setMissionDone] = useState(0);
  const [missionTotal, setMissionTotal] = useState(0);
  const showRankingLink = useParticipantRankingLink(eventId);

  useEffect(() => {
    setFromAdmin(readFromAdminFromUrl());
  }, []);

  useEffect(() => {
    if (fromAdmin) return;
    recordParticipantMainPage(eventId, `/events/${eventId}/features`);
  }, [eventId, fromAdmin]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setEventTitle("イベント");
        setFeatures(resolveEventFeatures(undefined));
        setEventActive(true);
        return;
      }
      const data = snap.data() as {
        title?: string;
        features?: unknown;
        status?: string;
      };
      setEventTitle(String(data.title ?? "イベント"));
      setFeatures(resolveEventFeatures(data.features));
      setEventActive(data.status !== "closed");
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const coll = collection(db, "events", eventId, "quizzes");
    const unsub = onSnapshot(coll, (snap) => {
      setQuizTotalCount(snap.size);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const coll = collection(db, "events", eventId, "missions");
    const unsub = onSnapshot(coll, (snap) => {
      const active = snap.docs.filter((d) => {
        const v = d.data() as { isActive?: boolean; visible?: boolean };
        return v.isActive !== false && v.visible !== false;
      });
      setMissionTotal(active.length);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (fromAdmin) return;
    let unsubProg: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProg?.();
      unsubProg = undefined;
      if (!user) {
        setMissionDone(0);
        return;
      }
      const session = getEventSession();
      const participantKey =
        session && session.eventId === eventId && session.uid ? session.uid : user.uid;
      unsubProg = onSnapshot(doc(db, "events", eventId, "missionProgress", participantKey), (snap) => {
        if (!snap.exists()) {
          setMissionDone(0);
          return;
        }
        const data = snap.data() as {
          checkedMissionIds?: unknown;
          numberValues?: Record<string, number>;
        };
        const checked = Array.isArray(data.checkedMissionIds) ? data.checkedMissionIds.length : 0;
        const nums = data.numberValues && typeof data.numberValues === "object" ? data.numberValues : {};
        const numPositive = Object.values(nums).filter((n) => typeof n === "number" && n > 0).length;
        setMissionDone(checked + numPositive);
      });
    });
    return () => {
      unsubAuth();
      unsubProg?.();
    };
  }, [eventId, fromAdmin]);

  const missionProgressLabel = useMemo(() => {
    if (!features.mission) return "—";
    if (missionTotal <= 0) return "—";
    return `${Math.min(missionDone, missionTotal)}/${missionTotal} 達成`;
  }, [features.mission, missionDone, missionTotal]);

  const activeQuizHint = useMemo(() => {
    if (!features.quiz || quizTotalCount <= 0) return "";
    return `${quizTotalCount}問出題中`;
  }, [features.quiz, quizTotalCount]);

  const soon = () => {
    window.alert("今後追加予定です");
  };

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${fromAdmin ? "pb-10" : PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 pb-2">
        <header className="rounded-[18px] border border-white/80 bg-white/95 p-4 shadow-sm">
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
          {fromAdmin ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/admin/${eventId}`}
                className="inline-flex rounded-[14px] bg-[#7C3AED] px-4 py-2 text-xs font-bold text-white shadow-sm touch-manipulation"
              >
                運営ダッシュボードへ
              </Link>
              <Link
                href={`/admin/${eventId}/quiz`}
                className="inline-flex rounded-[14px] border border-violet-200 bg-white px-4 py-2 text-xs font-bold text-[#7C3AED] shadow-sm touch-manipulation"
              >
                クイズ管理
              </Link>
            </div>
          ) : null}
        </header>

        <section className="rounded-[18px] border border-white/80 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-[#111827]">イベント機能</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6B7280]">
            {fromAdmin
              ? "各機能の運営画面へ進むことができます。"
              : "利用できるコンテンツを選べます。タップして参加しましょう！"}
          </p>

          <ul className="mt-4 space-y-3">
            {/* ミッション */}
            <li>
              <button
                type="button"
                disabled={!features.mission}
                onClick={() => {
                  if (!features.mission) return;
                  if (fromAdmin) router.push(`/admin/${eventId}`);
                  else router.push(`/events/${eventId}`);
                }}
                className="flex w-full items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50 touch-manipulation"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-[#7C3AED]">
                  <Target className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold text-[#111827]">ミッションカード</span>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                      {features.mission ? "利用中" : "無効"}
                    </span>
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                    いろんなミッションに挑戦しよう！
                  </p>
                  {!fromAdmin && features.mission ? (
                    <p className="mt-2 text-[11px] font-semibold text-[#7C3AED]">{missionProgressLabel}</p>
                  ) : null}
                </span>
                <span className="shrink-0 text-[#6B7280]">›</span>
              </button>
            </li>

            {/* クイズ */}
            <li>
              <button
                type="button"
                disabled={!features.quiz}
                onClick={() => {
                  if (!features.quiz) return;
                  if (fromAdmin) router.push(`/admin/${eventId}/quiz`);
                  else router.push(`/events/${eventId}/quiz`);
                }}
                className="flex w-full items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-50 touch-manipulation"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <HelpCircle className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold text-[#111827]">クイズ</span>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-200">
                      {features.quiz ? "利用中" : "無効"}
                    </span>
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                    出題中のクイズに回答できます。
                  </p>
                  {features.quiz && activeQuizHint ? (
                    <p className="mt-2 text-[11px] font-semibold text-[#6B7280]">{activeQuizHint}</p>
                  ) : null}
                </span>
                <span className="shrink-0 text-[#6B7280]">›</span>
              </button>
            </li>

            {/* ビンゴ */}
            <li>
              <button
                type="button"
                onClick={soon}
                className="flex w-full items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] touch-manipulation"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-50 text-zinc-500">
                  <LayoutGrid className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold text-[#111827]">ビンゴ</span>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-[#6B7280] ring-1 ring-zinc-200">
                      未利用
                    </span>
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                    ビンゴで景品をゲットしよう！
                  </p>
                </span>
                <span className="shrink-0 text-[#6B7280]">›</span>
              </button>
            </li>

            {/* ルーレット */}
            <li>
              <button
                type="button"
                onClick={soon}
                className="flex w-full items-start gap-3 rounded-2xl border border-zinc-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99] touch-manipulation"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-50 text-zinc-500">
                  <Sparkles className="h-6 w-6" strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-base font-bold text-[#111827]">ルーレット</span>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-[#6B7280] ring-1 ring-zinc-200">
                      未利用
                    </span>
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
                    ルーレットで運試し！
                  </p>
                </span>
                <span className="shrink-0 text-[#6B7280]">›</span>
              </button>
            </li>
          </ul>
        </section>
      </main>

      {!fromAdmin ? (
        <ParticipantBottomNav
          eventId={eventId}
          showRankingLink={showRankingLink}
          homeNavActive={false}
          featuresNavActive
          rankingNavActive={false}
          adminNavActive={false}
        />
      ) : null}
    </div>
  );
}
