"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SimpleRouletteCanvas } from "@/components/roulette/simple-roulette-canvas";
import { db } from "../../../lib/firebase";
import { useRouletteItemsSync } from "../../../lib/use-roulette-items-sync";
import { useRouletteSettingsSync } from "../../../lib/use-roulette-settings-sync";
import { useRouletteStateSync } from "../../../lib/use-roulette-state-sync";
import { clearEventScopedStorage } from "../../../lib/event-session";
import { resolveEventFeatures } from "../../../lib/event-features";
import { PARTICIPANT_MAIN_BOTTOM_PADDING } from "../../../lib/participant-ui";
import { recordParticipantMainPage } from "../../../lib/participant-last-page";
import { ParticipantBottomNav } from "../participant-bottom-nav";
import { ParticipantGateLoading } from "../participant-gate-loading";
import { useParticipantRankingLink } from "../use-participant-ranking-link";
import { useParticipantEventGate } from "../../../lib/use-participant-event-gate";

type Props = { eventId: string };

const BG = "min-h-screen bg-gradient-to-b from-[#FFF7E8] to-[#FFE9E5]";

export function ParticipantRouletteClient({ eventId }: Props) {
  const router = useRouter();
  const { allowed: gateAllowed } = useParticipantEventGate(eventId);
  const showRankingLink = useParticipantRankingLink(eventId);
  const [eventTitle, setEventTitle] = useState("イベント");
  const [eventActive, setEventActive] = useState(true);
  const [featureOn, setFeatureOn] = useState(false);
  const { settings, loading: settingsLoading } = useRouletteSettingsSync(eventId);
  const {
    displaySorted,
    displayLabels,
    remainingCount,
    loading: itemsLoading,
  } = useRouletteItemsSync(eventId, { showGradeLabels: settings.showGradeLabels });
  const {
    loading: stateLoading,
    visualRotation,
    spinAnimationMs,
    isSpinning,
    resultText,
    canSpin,
    spinBusy,
    handleStart,
  } = useRouletteStateSync(eventId, settings, displaySorted, { role: "participant" });

  useEffect(() => {
    recordParticipantMainPage(eventId, `/events/${eventId}/roulette`);
  }, [eventId]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "events", eventId), (snap) => {
      if (!snap.exists()) {
        clearEventScopedStorage(eventId);
        router.replace("/");
        return;
      }
      const data = snap.data() as { title?: string; status?: string; features?: unknown };
      setEventTitle(String(data.title ?? "イベント"));
      setEventActive(data.status !== "closed");
      setFeatureOn(resolveEventFeatures(data.features).roulette);
    });
    return () => unsub();
  }, [eventId, router]);

  if (!gateAllowed) {
    return <ParticipantGateLoading />;
  }

  if (!featureOn) {
    return (
      <div className={`${BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
        <main className="mx-auto w-full max-w-md pb-6">
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            この機能は現在利用できません。運営が有効化するまでお待ちください。
          </div>
        </main>
        <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
      </div>
    );
  }

  return (
    <div className={`${BG} px-4 pt-4 ${PARTICIPANT_MAIN_BOTTOM_PADDING}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 pb-6">
        <header className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-[#111827]">{eventTitle}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                eventActive
                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                  : "bg-zinc-100 text-[#6B7280] ring-1 ring-zinc-200"
              }`}
            >
              {eventActive ? "開催中" : "終了"}
            </span>
          </div>
        </header>

        <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A78BFA]">ルーレット</p>
          <h2 className="mt-1 text-xl font-black text-[#111827]">{settings.name}</h2>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            {settings.controlMode === "participant"
              ? "ボタンからルーレットを回せます"
              : "運営が抽選を開始すると結果が表示されます"}
          </p>
          {itemsLoading || settingsLoading || stateLoading ? (
            <p className="mt-4 text-center text-sm text-[#6B7280]">読み込み中…</p>
          ) : (
            <SimpleRouletteCanvas
              className="mt-4"
              canSpin={canSpin}
              items={displayLabels}
              spinDurationMs={settings.spinDurationMs}
              spinAnimationMs={spinAnimationMs}
              rotationDeg={visualRotation}
              externalSpinning={isSpinning}
              externalResult={resultText}
              onRequestSpin={() => void handleStart()}
              spinDisabled={spinBusy}
              waitMessage={
                isSpinning
                  ? "抽選中です…"
                  : settings.controlMode === "participant"
                    ? "準備ができたらSTARTを押してください"
                    : "運営の抽選開始をお待ちください"
              }
              remainingCount={
                settings.showRemainingCount ? remainingCount : null
              }
            />
          )}
        </section>
      </main>

      <ParticipantBottomNav eventId={eventId} showRankingLink={showRankingLink} />
    </div>
  );
}
