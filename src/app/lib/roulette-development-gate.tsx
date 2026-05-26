"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { db } from "./firebase";
import { resolveEventFeatures } from "./event-features";

/** ルーレット画面の開発停止フラグ（再開時は false に） */
const ROULETTE_UNDER_DEVELOPMENT = false;

type Props = {
  eventId: string;
  children: ReactNode;
};

/**
 * ルーレット機能ONのイベントで画面入室時に開発中モーダルを最前面表示する。
 * ルーレット本体のUI・ロジックには干渉しない表示制御のみ。
 */
export function RouletteDevelopmentGate({ eventId, children }: Props) {
  const router = useRouter();
  const [rouletteEnabled, setRouletteEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        setRouletteEnabled(false);
        return;
      }
      const data = snap.data() as { features?: unknown };
      setRouletteEnabled(resolveEventFeatures(data.features).roulette);
    });
    return () => unsub();
  }, [eventId]);

  const showModal =
    ROULETTE_UNDER_DEVELOPMENT && rouletteEnabled === true;

  return (
    <>
      <div
        className={showModal ? "pointer-events-none select-none" : undefined}
        aria-hidden={showModal ? true : undefined}
      >
        {children}
      </div>

      {showModal ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roulette-dev-modal-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-violet-100 bg-white p-5 shadow-xl">
            <h2
              id="roulette-dev-modal-title"
              className="text-center text-lg font-bold text-[#111827]"
            >
              現在開発中
            </h2>
            <p className="mt-3 text-center text-sm leading-relaxed text-[#6B7280]">
              ルーレット機能は現在調整中です。
              <br />
              正式公開までお待ちください。
            </p>
            <p className="mt-2 text-center text-xs font-semibold text-[#7C3AED]">
              近日公開予定です
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#7C3AED] text-sm font-bold text-white shadow-sm touch-manipulation"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
