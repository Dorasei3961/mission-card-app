"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { getEventCreatedAtMillis, normalizeEventListStatus } from "../lib/event-list";

type EventRow = {
  id: string;
  title: string;
  ownerUid: string;
  status: "active" | "closed";
  rankingVisible: boolean;
  participantsCount: number;
  createdAtMs: number;
};

export default function EventsListPage() {
  const [currentUid, setCurrentUid] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      setCurrentUid(user.uid);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const eventSnap = await getDocs(collection(db, "events"));
      const rows = await Promise.all(
        eventSnap.docs.map(async (eventDoc) => {
          const data = eventDoc.data() as {
            title?: string;
            ownerUid?: string;
            status?: string;
            rankingVisible?: boolean;
            createdAt?: unknown;
            endedAt?: unknown;
            deletedAt?: unknown;
          };
          const participantsSnap = await getDocs(collection(db, "events", eventDoc.id, "participants"));
          return {
            id: eventDoc.id,
            title: String(data.title ?? "イベント"),
            ownerUid: String(data.ownerUid ?? ""),
            status: normalizeEventListStatus(data),
            rankingVisible: Boolean(data.rankingVisible),
            participantsCount: participantsSnap.size,
            createdAtMs: getEventCreatedAtMillis(data),
          } as EventRow;
        }),
      );
      setEvents(rows);
      setLoading(false);
    };
    void load();
  }, []);

  const sorted = useMemo(
    () => [...events].sort((a, b) => b.createdAtMs - a.createdAtMs || a.title.localeCompare(b.title, "ja")),
    [events],
  );

  return (
    <div className="min-h-screen bg-zinc-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-black text-zinc-900">イベント一覧</h1>
          <p className="mt-1 text-sm text-zinc-600">開催状況と参加・結果確認ができます。</p>
          <Link href="/" className="mt-2 inline-flex text-sm font-semibold text-blue-600 underline">
            トップへ戻る
          </Link>
        </header>

        {loading ? <p className="text-center text-sm text-zinc-600">読み込み中…</p> : null}

        {sorted.map((event) => (
          <section key={event.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-extrabold text-zinc-900">{event.title}</h2>
            <div className="mt-2 space-y-1 text-xs text-zinc-700">
              <p>状態: {event.status === "active" ? "開催中" : "終了済み"}</p>
              <p>参加人数: {event.participantsCount}人</p>
              <p>ランキング: {event.rankingVisible ? "公開中" : "非公開"}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {event.status === "active" ? (
                <Link
                  href="/events/join"
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white"
                >
                  参加する
                </Link>
              ) : (
                <Link
                  href={`/events/${event.id}/ranking`}
                  className="rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white"
                >
                  結果を見る
                </Link>
              )}
              {event.ownerUid === currentUid ? (
                <Link
                  href={`/admin/${event.id}`}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
                >
                  運営画面
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

