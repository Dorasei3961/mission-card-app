import { Suspense } from "react";
import { ParticipantRouletteClient } from "./participant-roulette-client";

type PageProps = { params: Promise<{ eventId: string }> };

export default async function ParticipantRoulettePage({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FFF7E8] text-sm text-[#6B7280]">
          読み込み中…
        </div>
      }
    >
      <ParticipantRouletteClient eventId={eventId} />
    </Suspense>
  );
}
