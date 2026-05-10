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
    router.push(`/events/${eventId}/manage`);
  };

  const itemClass = (active: boolean) =>
    `flex min-h-[72px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold touch-manipulation ${
      active ? "text-[#7C3AED]" : "text-[#6B7280]"
    }`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white pb-[max(12px,env(safe-area-inset-bottom))] pt-1 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]"
      aria-label="参加者メイン操作"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        <button type="button" onClick={() => goHomeTarget()} className={itemClass(homeNavActive)}>
          <Home className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
          ホーム
        </button>
        <button type="button" onClick={() => goFeatures()} className={itemClass(featuresNavActive)}>
          <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
          機能
        </button>
        {showRankingLink ? (
          <Link href={`/events/${eventId}/ranking`} className={itemClass(rankingNavActive)}>
            <Trophy className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
            ランキング
          </Link>
        ) : (
          <div className={`${itemClass(false)} cursor-default opacity-40`} title="ランキングは非公開です">
            <Trophy className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
            ランキング
          </div>
        )}
        <button type="button" onClick={() => goAdmin()} className={itemClass(adminNavActive)}>
          <Shield className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
          管理
        </button>
      </div>
    </nav>
  );
}
