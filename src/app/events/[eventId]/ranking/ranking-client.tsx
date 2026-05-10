"use client";

import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../../../lib/firebase";
import { getEventSession } from "../../../lib/event-session";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../../lib/participant-ui";
import { ParticipantBottomNav } from "../participant-bottom-nav";

type Participant = {
  uid: string;
  name: string;
  totalPoints: number;
};

type Props = {
  eventId: string;
};

type RankTab = "all" | "team" | "self";

export function RankingClient({ eventId }: Props) {
  const [eventTitle, setEventTitle] = useState("ランキング");
  const [rankingVisible, setRankingVisible] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RankTab>("all");
  const [myParticipantKey, setMyParticipantKey] = useState<string | null>(null);

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
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setMyParticipantKey(null);
        return;
      }
      const session = getEventSession();
      const participantKey =
        session && session.eventId === eventId && session.uid ? session.uid : user.uid;
      setMyParticipantKey(participantKey);
    });
    return () => unsubAuth();
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

  const myRankRow = useMemo(() => {
    if (!myParticipantKey) return null;
    return ranked.find((r) => r.uid === myParticipantKey) ?? null;
  }, [ranked, myParticipantKey]);

  const showRankingNav = rankingVisible || isClosed;

  const tabButton = (id: RankTab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`min-w-0 flex-1 rounded-xl py-2 text-xs font-bold transition touch-manipulation ${
        tab === id ? "bg-[#7C3AED] text-white shadow-sm" : "bg-white text-[#6B7280] ring-1 ring-zinc-100"
      }`}
    >
      {label}
    </button>
  );

  const Row = ({ row }: { row: (typeof ranked)[0] }) => {
    const isSelf = myParticipantKey !== null && row.uid === myParticipantKey;
    const initial = row.name.slice(0, 1) || "?";
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border border-zinc-100 px-4 py-3 shadow-sm ${
          isSelf ? "bg-violet-50 ring-1 ring-[#7C3AED]/20" : "bg-white"
        }`}
      >
        <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums text-[#111827]">
          {row.rank}
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-[#7C3AED]">
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#111827]">{row.name}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums text-[#111827]">{row.totalPoints} pt</span>
      </div>
    );
  };

  const listForTab = (): typeof ranked => {
    if (tab === "self" && myRankRow) {
      const idx = ranked.findIndex((r) => r.uid === myRankRow.uid);
      const start = Math.max(0, idx - 2);
      const end = Math.min(ranked.length, idx + 3);
      return ranked.slice(start, end);
    }
    return ranked;
  };

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header>
          <h1 className="text-xl font-bold text-[#111827]">ランキング</h1>
          <p className="mt-1 text-sm text-[#6B7280]">{eventTitle} · みんなのポイントランキング</p>
        </header>

        {!loading && !rankingVisible && !isClosed ? (
          <section className="rounded-2xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-bold text-[#111827]">現在ランキングは非公開です</p>
          </section>
        ) : (
          <>
            <div role="tablist" aria-label="ランキングの表示切替" className="flex gap-2">
              {tabButton("all", "全体")}
              {tabButton("team", "同じチーム")}
              {tabButton("self", "自分の順位")}
            </div>

            {tab === "team" ? (
              <p className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] font-medium text-amber-900">
                チーム情報はまだ連携されていません。全体ランキングと同じ一覧を表示しています。
              </p>
            ) : null}

            {tab === "self" && myRankRow ? (
              <div className="rounded-2xl border border-[#7C3AED]/25 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-[#6B7280]">あなたの順位</p>
                <p className="mt-1 text-2xl font-bold text-[#7C3AED]">
                  {myRankRow.rank}
                  <span className="text-base font-semibold text-[#111827]"> 位</span>
                </p>
                <p className="mt-1 text-sm text-[#111827]">
                  {myRankRow.name} · {myRankRow.totalPoints} pt
                </p>
              </div>
            ) : null}

            <section className="flex flex-col gap-3">
              {listForTab().map((row) => (
                <Row key={row.uid} row={row} />
              ))}
              {!ranked.length && loading ? (
                <p className="text-center text-sm text-[#6B7280]">読み込み中…</p>
              ) : null}
              {!ranked.length && !loading ? (
                <p className="text-center text-sm text-[#6B7280]">参加者データがありません。</p>
              ) : null}
            </section>
          </>
        )}
      </main>
      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingNav} />
    </div>
  );
}
