"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../../lib/participant-ui";
import { getLastEventPage, recordParticipantMainPage } from "../../../lib/participant-last-page";
import { EventQuiz } from "../features/event-quiz";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { useParticipantRankingLink } from "../use-participant-ranking-link";

type Props = { eventId: string };

export function ParticipantQuizShell({ eventId }: Props) {
  const router = useRouter();
  const showRankingLink = useParticipantRankingLink(eventId);

  useEffect(() => {
    recordParticipantMainPage(eventId, `/events/${eventId}/quiz`);
  }, [eventId]);

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <header className="mx-auto mb-4 flex max-w-md items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(getLastEventPage(eventId))}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-zinc-200 bg-white text-[#111827] shadow-sm touch-manipulation"
          aria-label="直前の画面へ戻る"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-[#7C3AED]">クイズ</p>
          <h1 className="truncate text-lg font-bold text-[#111827]">出題中のクイズに回答</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md">
        <EventQuiz eventId={eventId} />
      </main>
      <ParticipantBottomNav
        eventId={eventId}
        showRankingLink={showRankingLink}
        homeNavActive={false}
        featuresNavActive={false}
        rankingNavActive={false}
        adminNavActive={false}
      />
    </div>
  );
}
