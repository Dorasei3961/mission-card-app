"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { QuizAdminPanel } from "../../../events/[eventId]/features/quiz-admin-panel";
import { getAdminAccess } from "../../../lib/event-session";
import { useRedirectIfEventMissing } from "../../../lib/use-redirect-if-event-missing";

type Props = { eventId: string };

export function AdminQuizClient({ eventId }: Props) {
  const router = useRouter();
  useRedirectIfEventMissing(eventId);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [showGuide, setShowGuide] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-b from-[#FFF7E8] to-[#FFE9E5] px-4 pb-32 pt-4">
      <header className="mx-auto mb-4 flex max-w-md items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
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
        </div>
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-[14px] border border-[#7C3AED] bg-white px-3 text-xs font-bold text-[#7C3AED] touch-manipulation"
        >
          <HelpCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          ？ 使い方ガイド
        </button>
      </header>
      {showGuide ? (
        <section className="mx-auto mb-4 max-w-md rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-[#111827]">使い方ガイド</p>
          <ul className="mt-2 space-y-1 text-xs text-[#6B7280]">
            <li>「問題作成」タブで問題を追加・編集します。</li>
            <li>「クイズ進行」タブで手動または自動の進行を行います。</li>
            <li>「結果一覧」タブで回答結果を確認します。</li>
          </ul>
        </section>
      ) : null}
      <main className="mx-auto max-w-6xl">
        <QuizAdminPanel eventId={eventId} />
      </main>
    </div>
  );
}
