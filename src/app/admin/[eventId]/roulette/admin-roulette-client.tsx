"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { SimpleRouletteCanvas } from "@/components/roulette/simple-roulette-canvas";
import { db } from "../../../lib/firebase";
import { useRedirectIfEventMissing } from "../../../lib/use-redirect-if-event-missing";
import { useEventAdminAccess } from "../../../lib/use-event-admin-access";

type Props = { eventId: string };

const BG = "min-h-screen bg-gradient-to-b from-[#FFF7E8] via-[#FFF5EE] to-[#EDE9FE]";

export function AdminRouletteClient({ eventId }: Props) {
  useRedirectIfEventMissing(eventId);
  const { allowed } = useEventAdminAccess({ eventId });
  const [eventTitle, setEventTitle] = useState("イベント");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as { title?: string };
      setEventTitle(String(data.title ?? "イベント"));
    });
    return () => unsub();
  }, [eventId]);

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600">
        読み込み中…
      </div>
    );
  }

  return (
    <div className={`${BG} px-4 pb-24 pt-4`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-xs font-semibold text-[#7C3AED]">{eventTitle}（運営）</p>
          <h1 className="mt-1 text-xl font-bold text-[#111827]">景品ルーレット</h1>
          <p className="mt-1 text-xs font-medium text-[#6B7280]">
            STARTで回転し、約4秒で結果が表示されます
          </p>
        </header>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <SimpleRouletteCanvas canSpin showItemEditor />
        </section>

        <Link
          href={`/admin/${eventId}`}
          className="block text-center text-sm font-semibold text-[#7C3AED] underline"
        >
          運営ダッシュボードへ戻る
        </Link>
      </main>
    </div>
  );
}
