import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { EventQuiz } from "../features/event-quiz";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function ParticipantQuizPage({ params }: PageProps) {
  const { eventId } = await params;

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-zinc-50 p-4 pb-10">
      <header className="mx-auto mb-4 flex max-w-md items-center gap-2">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm touch-manipulation"
          aria-label="参加画面に戻る"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-2 shadow-sm">
          <p className="text-[11px] font-semibold text-violet-600">クイズ</p>
          <h1 className="truncate text-sm font-bold text-zinc-900">出題中のクイズに回答</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md">
        <EventQuiz eventId={eventId} />
      </main>
    </div>
  );
}
