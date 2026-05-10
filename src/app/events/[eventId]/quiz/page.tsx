import { Suspense } from "react";
import { ParticipantQuizShell } from "./participant-quiz-shell";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function ParticipantQuizPage({ params }: PageProps) {
  const { eventId } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-violet-50 p-4 text-sm text-zinc-600">
          読み込み中…
        </div>
      }
    >
      <ParticipantQuizShell eventId={eventId} />
    </Suspense>
  );
}
