"use client";

import { useEffect } from "react";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../../lib/participant-ui";
import { recordParticipantMainPage } from "../../../lib/participant-last-page";
import { EventQuiz } from "../features/event-quiz";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { useParticipantRankingLink } from "../use-participant-ranking-link";

type Props = { eventId: string };

export function ParticipantQuizShell({ eventId }: Props) {
  const showRankingLink = useParticipantRankingLink(eventId);

  useEffect(() => {
    recordParticipantMainPage(eventId, `/events/${eventId}/quiz`);
  }, [eventId]);

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <header className="mx-auto mb-4 max-w-md">
        <p className="text-[11px] font-semibold text-[#7C3AED]">クイズ</p>
        <h1 className="mt-0.5 text-lg font-bold text-[#111827]">出題中のクイズに回答</h1>
      </header>
      <main className="mx-auto max-w-md">
        <EventQuiz eventId={eventId} />
      </main>
      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
