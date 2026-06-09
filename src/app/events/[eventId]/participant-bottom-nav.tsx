"use client";

import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { Home, Shield, Trophy } from "lucide-react";
import { clearEventScopedStorage } from "../../lib/event-session";
import { db } from "../../lib/firebase";
import { getDefaultEventHomePage } from "../../lib/participant-last-page";

export type ParticipantBottomNavProps = {
  eventId: string;
  showRankingLink: boolean;
};

/** `/events/{id}/{segment}` またはその配下のみマッチ（`/quizz` などを除外） */
function matchesSubpath(base: string, pathname: string, segment: string): boolean {
  const prefix = `${base}/${segment}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function ParticipantBottomNav({ eventId, showRankingLink }: ParticipantBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";

  const base = `/events/${eventId}`;

  /** 削除済み等で events/{eventId} が無いときは TOP へ。タブ押下のたびに確認する */
  const navigateIfEventExists = async (navigate: () => void) => {
    try {
      const snap = await getDoc(doc(db, "events", eventId));
      if (!snap.exists()) {
        clearEventScopedStorage(eventId);
        router.replace("/");
        return;
      }
      navigate();
    } catch (e) {
      console.error("[ParticipantBottomNav] event existence check failed", { eventId, e });
    }
  };

  const isFeaturesHub = matchesSubpath(base, pathname, "features");
  const isHomeSection =
    isFeaturesHub ||
    pathname === base ||
    pathname === `${base}/` ||
    matchesSubpath(base, pathname, "quiz") ||
    matchesSubpath(base, pathname, "mission") ||
    matchesSubpath(base, pathname, "bingo") ||
    matchesSubpath(base, pathname, "roulette");

  const rankingNavActive = matchesSubpath(base, pathname, "ranking");
  const adminNavActive = matchesSubpath(base, pathname, "manage");

  const homeNavActive = isHomeSection && !rankingNavActive && !adminNavActive;

  const goHomeTarget = () => {
    void navigateIfEventExists(() => {
      router.push(getDefaultEventHomePage(eventId));
    });
  };

  const goAdmin = () => {
    void navigateIfEventExists(() => {
      router.push(`/events/${eventId}/manage`);
    });
  };

  const goRanking = () => {
    void navigateIfEventExists(() => {
      router.push(`/events/${eventId}/ranking`);
    });
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
      <div className="mx-auto grid max-w-md grid-cols-3">
        <button type="button" onClick={() => goHomeTarget()} className={itemClass(homeNavActive)}>
          <Home className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
          ホーム
        </button>
        {showRankingLink ? (
          <button type="button" onClick={() => goRanking()} className={itemClass(rankingNavActive)}>
            <Trophy className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
            ランキング
          </button>
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
