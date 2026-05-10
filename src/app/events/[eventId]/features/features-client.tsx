"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import { resolveEventFeatures } from "../../../lib/event-features";
import { QuizAdminPanel } from "./quiz-admin-panel";
import { EventQuiz } from "./event-quiz";

type Props = { eventId: string };

type FeatureTab = "mission" | "quiz" | "bingo" | "roulette";

/** URL は参加者経由のみ ?from=admin を付ける。未指定・それ以外は参加者モード（運営導線を出さない） */
function readFromAdminFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("from");
  return v === "admin";
}

export function EventFeaturesClient({ eventId }: Props) {
  const [eventTitle, setEventTitle] = useState("イベント");
  const [features, setFeatures] = useState(resolveEventFeatures(undefined));
  const [fromAdmin, setFromAdmin] = useState(false);
  const [tab, setTab] = useState<FeatureTab>("mission");

  useEffect(() => {
    setFromAdmin(readFromAdminFromUrl());
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setEventTitle("イベント");
        setFeatures(resolveEventFeatures(undefined));
        return;
      }
      const data = snap.data() as { title?: string; features?: unknown };
      setEventTitle(String(data.title ?? "イベント"));
      setFeatures(resolveEventFeatures(data.features));
    });
    return () => unsub();
  }, [eventId]);

  const tabs = useMemo(
    () =>
      [
        { id: "mission" as const, label: "ミッション" },
        { id: "quiz" as const, label: "クイズ" },
        { id: "bingo" as const, label: "ビンゴ" },
        { id: "roulette" as const, label: "ルーレット" },
      ] as const,
    [],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-zinc-50 p-4 pb-10">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-violet-600">{eventTitle}</p>
          <h1 className="mt-1 text-xl font-bold text-zinc-900">イベント機能</h1>
          <p className="mt-2 text-xs leading-relaxed text-zinc-600">
            {fromAdmin
              ? "タブから各機能を管理・確認できます。"
              : "タブから利用できるコンテンツを選べます。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/events/${eventId}`}
              className="inline-flex rounded-xl bg-zinc-700 px-4 py-2 text-xs font-bold text-white shadow-sm touch-manipulation"
            >
              参加画面へ
            </Link>
            {fromAdmin ? (
              <Link
                href={`/admin/${eventId}`}
                className="inline-flex rounded-xl bg-[#7C3AED] px-4 py-2 text-xs font-bold text-white shadow-sm touch-manipulation"
              >
                運営ダッシュボード
              </Link>
            ) : null}
          </div>
        </header>

        <div
          role="tablist"
          aria-label="イベント機能のタブ"
          className="flex gap-1 overflow-x-auto rounded-2xl border border-violet-100 bg-white p-1.5 shadow-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              id={`feature-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition touch-manipulation ${
                tab === t.id ? "bg-[#7C3AED] text-white shadow-sm" : "text-zinc-600 hover:bg-violet-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "mission" ? (
          <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-zinc-900">ミッション</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  features.mission ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {features.mission ? "利用中" : "無効"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-700">
              {fromAdmin
                ? "ミッションカードの作成・編集・達成状況は運営ダッシュボードから行えます。"
                : "ミッションに挑戦してポイントをためられます。"}
            </p>
            {features.mission ? (
              <div className="mt-4">
                {fromAdmin ? (
                  <Link
                    href={`/admin/${eventId}`}
                    className="inline-flex rounded-xl bg-[#7C3AED] px-4 py-2.5 text-sm font-bold text-white shadow-sm touch-manipulation"
                  >
                    ミッション管理を開く
                  </Link>
                ) : (
                  <Link
                    href={`/events/${eventId}`}
                    className="inline-flex rounded-xl bg-[#7C3AED] px-4 py-2.5 text-sm font-bold text-white shadow-sm touch-manipulation"
                  >
                    参加画面のミッションへ
                  </Link>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">現在は無効です。</p>
            )}
          </section>
        ) : null}

        {tab === "quiz" ? (
          fromAdmin ? (
            <QuizAdminPanel eventId={eventId} />
          ) : features.quiz ? (
            <EventQuiz eventId={eventId} />
          ) : (
            <section className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 p-6 text-center shadow-sm">
              <p className="text-sm font-semibold text-zinc-700">クイズ機能はまだ有効になっていません</p>
              <p className="mt-2 text-xs text-zinc-500">運営が有効にすると、ここからクイズに参加できます。</p>
            </section>
          )
        ) : null}

        {tab === "bingo" ? (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">ビンゴ</h2>
            <p className="mt-2 text-sm text-zinc-600">未利用 · 今後追加予定です。</p>
          </section>
        ) : null}

        {tab === "roulette" ? (
          <section className="rounded-2xl border border-dashed border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-bold text-zinc-900">ルーレット</h2>
            <p className="mt-2 text-sm text-zinc-600">未利用 · 今後追加予定です。</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
