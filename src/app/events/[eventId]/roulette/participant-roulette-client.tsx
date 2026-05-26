"use client";

import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SimpleRouletteCanvas } from "@/components/roulette/simple-roulette-canvas";
import { auth, db } from "../../../lib/firebase";
import { clearEventScopedStorage } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import { PARTICIPANT_MAIN_BOTTOM_PADDING } from "../../../lib/participant-ui";
import { recordParticipantMainPage } from "../../../lib/participant-last-page";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { useParticipantRankingLink } from "../use-participant-ranking-link";

type Props = { eventId: string };

const ROULETTE_GRADIENT = "min-h-screen bg-gradient-to-b from-[#FFF7E8] to-[#FFE9E5]";

export function ParticipantRouletteClient({ eventId }: Props) {
  const router = useRouter();
  const showRankingLink = useParticipantRankingLink(eventId);
  const [eventTitle, setEventTitle] = useState("イベント");
  const [eventActive, setEventActive] = useState(true);
  const [featureOn, setFeatureOn] = useState(false);

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

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A78BFA]">ルーレット</p>
          <h2 className="mt-1 text-xl font-black text-[#111827]">景品ルーレット</h2>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            ボタンを押してルーレットを回しましょう
          </p>

          <div className="mt-6">
            <SimpleRouletteCanvas />
          </div>
        </section>
      </main>

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
