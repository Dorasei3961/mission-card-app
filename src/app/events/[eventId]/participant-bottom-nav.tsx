"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, LayoutGrid, Shield, Trophy } from "lucide-react";
import {
  getLastEventPage,
  recordParticipantMainPage,
} from "../../lib/participant-last-page";

export type ParticipantBottomNavProps = {
  eventId: string;
  showRankingLink: boolean;
  homeNavActive: boolean;
  featuresNavActive: boolean;
  rankingNavActive: boolean;
  adminNavActive: boolean;
};

export function ParticipantBottomNav({
  eventId,
  showRankingLink,
  homeNavActive,
  featuresNavActive,
  rankingNavActive,
  adminNavActive,
}: ParticipantBottomNavProps) {
  const router = useRouter();

  const goHomeTarget = () => {
    router.push(getLastEventPage(eventId));
  };

  const goFeatures = () => {
    recordParticipantMainPage(eventId, `/events/${eventId}/features`);
    router.push(`/events/${eventId}/features?from=participant`);
  };

  const goAdmin = () => {
    router.push(`/events/${eventId}?tab=admin`);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      aria-label="参加者メイン操作"
    >
      <div className="mx-auto grid h-14 max-w-md grid-cols-4">
        <button
          type="button"
          onClick={() => goHomeTarget()}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold touch-manipulation ${
            homeNavActive ? "text-violet-700" : "text-zinc-500"
          }`}
        >
          <Home className="h-5 w-5" strokeWidth={2} aria-hidden />
          ホーム
        </button>
        <button
          type="button"
          onClick={() => goFeatures()}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold touch-manipulation ${
            featuresNavActive ? "text-violet-700" : "text-zinc-500"
          }`}
        >
          <LayoutGrid className="h-5 w-5" strokeWidth={2} aria-hidden />
          機能
        </button>
        {showRankingLink ? (
          <Link
            href={`/events/${eventId}/ranking`}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold touch-manipulation ${
              rankingNavActive ? "text-violet-700" : "text-zinc-500"
            }`}
          >
            <Trophy className="h-5 w-5" strokeWidth={2} aria-hidden />
            ランキング
          </Link>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-zinc-300"
            title="ランキングは非公開です"
          >
            <Trophy className="h-5 w-5" strokeWidth={2} aria-hidden />
            ランキング
          </div>
        )}
        <button
          type="button"
          onClick={() => goAdmin()}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold touch-manipulation ${
            adminNavActive ? "text-violet-700" : "text-zinc-500"
          }`}
        >
          <Shield className="h-5 w-5" strokeWidth={2} aria-hidden />
          管理
        </button>
      </div>
    </nav>
  );
}
