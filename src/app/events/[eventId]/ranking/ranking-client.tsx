"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../../../lib/firebase";

type Participant = {
  uid: string;
  name: string;
  totalPoints: number;
};

type Props = {
  eventId: string;
};

export function RankingClient({ eventId }: Props) {
  const [eventTitle, setEventTitle] = useState("ランキング");
  const [rankingVisible, setRankingVisible] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setEventTitle("イベント");
        setRankingVisible(false);
        setLoading(false);
        return;
      }
      const data = snap.data() as {
        title?: string;
        rankingVisible?: boolean;
        status?: "active" | "closed";
      };
      setEventTitle(String(data.title ?? "イベント"));
      setRankingVisible(Boolean(data.rankingVisible));
      setIsClosed(data.status === "closed");
      setLoading(false);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    const q = query(
      collection(db, "events", eventId, "participants"),
      orderBy("totalPoints", "desc"),
      orderBy("name", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as { name?: string; totalPoints?: number };
        return {
          uid: d.id,
          name: data.name?.trim() || "未登録",
          totalPoints: typeof data.totalPoints === "number" ? data.totalPoints : 0,
        };
      });
      setParticipants(rows);
    });
    return () => unsub();
  }, [eventId]);

  const ranked = useMemo(
    () => participants.map((p, index) => ({ ...p, rank: index + 1 })),
    [participants],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-100 via-sky-100 to-cyan-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-2xl border-4 border-violet-300 bg-white p-4 shadow-[0_8px_0_#7c3aed]">
          <p className="text-sm font-semibold text-violet-700">{eventTitle}</p>
          <h1 className="text-2xl font-black text-zinc-900">ランキング</h1>
          <div className="mt-3 flex gap-2">
            <Link
              href={`/events/${eventId}`}
              className="inline-flex rounded-full bg-zinc-500 px-4 py-2 text-sm font-bold text-white"
            >
              イベントへ戻る
            </Link>
          </div>
        </header>

        {!loading && !rankingVisible && !isClosed ? (
          <section className="rounded-2xl border-4 border-zinc-300 bg-white p-5 text-center shadow-[0_8px_0_#a1a1aa]">
            <p className="text-base font-bold text-zinc-800">現在ランキングは非公開です</p>
          </section>
        ) : (
          <section className="space-y-2">
            {ranked.map((row) => {
              const topStyle =
                row.rank === 1
                  ? "border-yellow-300 bg-yellow-100"
                  : row.rank === 2
                    ? "border-slate-300 bg-slate-100"
                    : row.rank === 3
                      ? "border-amber-300 bg-amber-100"
                      : "border-sky-200 bg-white";
              return (
                <div key={row.uid} className={`rounded-xl border-2 p-3 shadow-sm ${topStyle}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-black text-zinc-900">#{row.rank}</span>
                    <span className="text-base font-bold text-zinc-900">{row.name}</span>
                    <span className="text-sm font-extrabold text-emerald-700">
                      {row.totalPoints} pt
                    </span>
                  </div>
                </div>
              );
            })}
            {!ranked.length && loading ? (
              <p className="text-center text-sm text-zinc-600">読み込み中…</p>
            ) : null}
            {!ranked.length && !loading ? (
              <p className="text-center text-sm text-zinc-600">参加者データがありません。</p>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}

