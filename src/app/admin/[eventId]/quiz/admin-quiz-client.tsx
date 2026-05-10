"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { QuizAdminPanel } from "../../../events/[eventId]/features/quiz-admin-panel";
import { getAdminAccess } from "../../../lib/event-session";

type Props = { eventId: string };

export function AdminQuizClient({ eventId }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    setAllowed(getAdminAccess(eventId));
  }, [eventId]);

  useEffect(() => {
    if (allowed === false) router.replace(`/events/${eventId}/manage`);
  }, [allowed, eventId, router]);

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-100 px-4 pb-28 pt-4">
      <header className="mx-auto mb-4 flex max-w-md items-center gap-3">
        <Link
          href={`/admin/${eventId}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-zinc-200 bg-white text-[#111827] shadow-sm touch-manipulation"
          aria-label="運営ダッシュボードへ戻る"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#7C3AED]">運営</p>
          <h1 className="truncate text-lg font-bold text-[#111827]">クイズ管理</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md">
        <QuizAdminPanel eventId={eventId} />
      </main>
    </div>
  );
}
