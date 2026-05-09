"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import { resolveEventFeatures } from "../../../lib/event-features";

type Props = { eventId: string };

export function EventFeaturesClient({ eventId }: Props) {
  const [eventTitle, setEventTitle] = useState("イベント");
  const [features, setFeatures] = useState(resolveEventFeatures(undefined));

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

  const cards = useMemo(
    () => [
      {
        id: "mission",
        title: "ミッション",
        enabled: features.mission,
        description: "ミッションカードの作成・編集・達成状況を確認できます。",
      },
      {
        id: "quiz",
        title: "クイズ",
        enabled: features.quiz,
        description: "クイズ作成・出題・結果確認ができます。",
      },
      {
        id: "bingo",
        title: "ビンゴ",
        enabled: features.bingo,
        description: "9×9ビンゴや数字抽選ができます。",
      },
      {
        id: "roulette",
        title: "ルーレット",
        enabled: features.roulette,
        description: "抽選・チーム分け・景品決めに使えます。",
      },
    ],
    [features],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-100 via-violet-100 to-sky-100 p-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="rounded-2xl border-4 border-fuchsia-300 bg-white p-4 shadow-[0_8px_0_#d946ef]">
          <p className="text-sm font-semibold text-fuchsia-700">{eventTitle}</p>
          <h1 className="text-2xl font-black text-zinc-900">イベント機能</h1>
          <p className="mt-1 text-xs text-zinc-600">
            イベントで利用するコンテンツ機能を確認できます。
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href={`/events/${eventId}`}
              className="inline-flex rounded-full bg-zinc-500 px-4 py-2 text-sm font-bold text-white"
            >
              参加画面へ
            </Link>
            <Link
              href={`/admin/${eventId}`}
              className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white"
            >
              運営画面へ
            </Link>
          </div>
        </header>

        <section className="space-y-3">
          {cards.map((card) => (
            <article
              key={card.id}
              className="rounded-2xl border-4 border-fuchsia-200 bg-white p-4 shadow-[0_8px_0_#c026d3]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-extrabold text-zinc-900">{card.title}</h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    card.enabled ? "bg-emerald-100 text-emerald-900" : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {card.enabled ? "利用中" : "今後追加予定"}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-700">{card.description}</p>

              {card.id === "mission" ? (
                <div className="mt-3">
                  {card.enabled ? (
                    <Link
                      href={`/admin/${eventId}`}
                      className="inline-flex rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white"
                    >
                      ミッション管理を開く
                    </Link>
                  ) : (
                    <p className="text-xs text-zinc-500">現在は無効です。</p>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
