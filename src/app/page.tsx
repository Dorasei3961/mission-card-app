"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./lib/firebase";
import { getEventSession } from "./lib/event-session";

type ActiveEvent = {
  id: string;
  title: string;
  creatorName: string;
};

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const skipOnce = sessionStorage.getItem("skip_home_event_autoredirect_once");
      if (skipOnce === "1") {
        sessionStorage.removeItem("skip_home_event_autoredirect_once");
        setChecking(false);
        return;
      }
    }
    const session = getEventSession();
    if (session?.eventId) {
      router.replace(`/events/${session.eventId}`);
      return;
    }
    setChecking(false);
  }, [router]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const snap = await getDocs(collection(db, "events"));
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as { title?: string; creatorName?: string; status?: string };
            return {
              id: d.id,
              title: data.title?.trim() || "イベント",
              creatorName: data.creatorName?.trim() || "未設定",
              status: data.status === "closed" ? "closed" : "active",
            };
          })
          .filter((event) => event.status === "active")
          .map(({ id, title, creatorName }) => ({ id, title, creatorName } as ActiveEvent));
        setActiveEvents(rows);
      } catch (error) {
        console.error("[home] active events load failed", error);
        setActiveEvents([]);
      }
    };
    void loadEvents();
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <p className="text-sm text-zinc-600">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-6">
      <main className="mx-auto flex w-full max-w-md flex-col gap-8 pt-12">
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900">イベントチャレンジ</h1>
          <p className="mt-2 text-sm text-zinc-600">イベント作成・参加ができます。</p>
        </div>

        <div className="flex flex-col gap-4">
          <Link
            href="/events/create"
            className="rounded-2xl bg-emerald-600 px-6 py-5 text-center text-lg font-bold text-white shadow-md active:bg-emerald-700"
          >
            イベント作成
          </Link>
          <Link
            href="/events/join"
            className="rounded-2xl bg-sky-600 px-6 py-5 text-center text-lg font-bold text-white shadow-md active:bg-sky-700"
          >
            イベント参加
          </Link>
          <Link
            href="/events"
            className="rounded-2xl bg-violet-600 px-6 py-5 text-center text-lg font-bold text-white shadow-md active:bg-violet-700"
          >
            開催中のイベントを見る
          </Link>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-black text-zinc-900">開催中イベント</h2>
          <div className="mt-3 space-y-2">
            {activeEvents.map((event) => (
              <Link
                key={event.id}
                href={`/events/join?eventName=${encodeURIComponent(event.title)}`}
                className="block rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3"
              >
                <p className="text-sm font-bold text-zinc-900">{event.title}</p>
                <p className="text-xs text-zinc-600">作成者: {event.creatorName}</p>
              </Link>
            ))}
            {activeEvents.length === 0 ? (
              <p className="text-sm text-zinc-600">現在開催中のイベントはありません。</p>
            ) : null}
          </div>
        </section>

        <p className="text-center text-xs text-zinc-500">
          参加済みの場合は自動でイベント画面を開きます（この端末に保存されたとき）。
        </p>
      </main>
    </div>
  );
}
