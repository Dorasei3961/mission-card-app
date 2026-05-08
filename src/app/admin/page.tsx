"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getEventSession } from "../lib/event-session";

export default function AdminPage() {
  const router = useRouter();
  const [eventTitle, setEventTitle] = useState("");

  useEffect(() => {
    const session = getEventSession();
    if (session?.eventId) {
      router.replace(`/admin/${session.eventId}`);
      return;
    }
    setEventTitle("対象イベントが見つかりません");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 pt-8">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-black text-zinc-900">運営管理画面</h1>
          <p className="mt-2 text-sm text-zinc-600">{eventTitle}</p>
          <Link href="/" className="mt-4 inline-flex text-sm font-semibold text-blue-600 underline">
            トップへ戻る
          </Link>
        </section>
      </main>
    </div>
  );
}
