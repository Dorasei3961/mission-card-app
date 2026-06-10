"use client";

import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { clearEventScopedStorage, getEventSession } from "../../../lib/event-session";
import { PARTICIPANT_MAIN_BOTTOM_PADDING, PARTICIPANT_PAGE_BG } from "../../../lib/participant-ui";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { ParticipantGateLoading } from "../participant-gate-loading";
import { useParticipantEventGate } from "../../../lib/use-participant-event-gate";

type Participant = {
  uid: string;
  name: string;
  totalPoints: number;
};

type Props = {
  eventId: string;
};

type RankTab = "all" | "team" | "self";

/** participants ドキュメントから表示名を決定（フィールド揺れに対応） */
function pickNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  return "";
}

function resolveParticipantDisplayName(data: Record<string, unknown>): string {
  const nested = data.ranking;
  const nestedObj =
    nested && typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : null;
  const fromRanking = nestedObj
    ? pickNonEmptyString(nestedObj.participantName, nestedObj.name, nestedObj.displayName)
    : "";
  if (fromRanking) return fromRanking;
  const resolved = pickNonEmptyString(
    data.participantName,
    data.name,
    data.displayName,
  );
  return resolved || "名前未設定";
}

export function RankingClient({ eventId }: Props) {
  const router = useRouter();
  const { allowed: gateAllowed } = useParticipantEventGate(eventId);
  const [eventTitle, setEventTitle] = useState("ランキング");
  const [rankingVisible, setRankingVisible] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  /** イベントメタの読み込み完了（ランキング公開可否など） */
  const [eventMetaReady, setEventMetaReady] = useState(false);
  /** participants の初回スナップショットを受信済みか（リロード時の空表示チラつき防止） */
  const [participantsReady, setParticipantsReady] = useState(false);
  const [tab, setTab] = useState<RankTab>("all");
  const [myParticipantKey, setMyParticipantKey] = useState<string | null>(null);
  const [listError, setListError] = useState("");

  useEffect(() => {
    setEventMetaReady(false);
    setListError("");
    const unsub = onSnapshot(
      doc(db, "events", eventId),
      (snap) => {
        if (!snap.exists()) {
          clearEventScopedStorage(eventId);
          router.replace("/");
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
        setEventMetaReady(true);
      },
      (err) => {
        console.error("[ranking] event snapshot error", { eventId, err });
        setListError("通信に失敗しました。もう一度お試しください。");
      },
    );
    return () => unsub();
  }, [eventId, router]);

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
    setParticipantsReady(false);
    const coll = collection(db, "events", eventId, "participants");
    const unsub = onSnapshot(
      coll,
      (snap) => {
        setListError("");
        const rows: Participant[] = snap.docs.map((d) => {
          const raw = d.data() as Record<string, unknown>;
          const pts = raw.totalPoints;
          return {
            uid: d.id,
            name: resolveParticipantDisplayName(raw),
            totalPoints: typeof pts === "number" && Number.isFinite(pts) ? pts : 0,
          };
        });
        rows.sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
          return a.name.localeCompare(b.name, "ja");
        });
        setParticipants(rows);
        setParticipantsReady(true);
      },
      (err) => {
        console.error("[ranking] participants snapshot error", { eventId, err });
        setListError("通信に失敗しました。もう一度お試しください。");
        setParticipantsReady(true);
      },
    );
    return () => unsub();
  }, [eventId]);

  const ranked = useMemo(
    () => participants.map((p, index) => ({ ...p, rank: index + 1 })),
    [participants],
  );

  const listLoading = !eventMetaReady || !participantsReady;

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
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border border-zinc-100 px-4 py-3 shadow-sm ${
          isSelf ? "bg-violet-50 ring-1 ring-[#7C3AED]/20" : "bg-white"
        }`}
      >
        <span className="w-10 shrink-0 text-left text-lg font-bold tabular-nums text-[#111827]">
          {row.rank}位
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#111827]">{row.name}</span>
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

  if (!gateAllowed) {
    return <ParticipantGateLoading />;
  }

  return (
    <div className={`${PARTICIPANT_PAGE_BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header>
          <h1 className="text-xl font-bold text-[#111827]">ランキング</h1>
          <p className="mt-1 text-sm text-[#6B7280]">{eventTitle} · みんなのポイントランキング</p>
        </header>

        {listError ? (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-800">
            {listError}
          </p>
        ) : null}

        {!listLoading && !rankingVisible && !isClosed ? (
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
              {listLoading ? (
                <p className="text-center text-sm text-[#6B7280]">読み込み中…</p>
              ) : (
                listForTab().map((row) => <Row key={row.uid} row={row} />)
              )}
              {!listLoading && !ranked.length ? (
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
