import Link from "next/link";
import { ABOUT_LINKS } from "./about-links";

export function AboutNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-[100] flex items-center justify-between border-b-2 border-dashed border-[#FCD34D]/55 bg-[#FFFBF0]/92 px-4 py-3.5 backdrop-blur-md sm:px-8">
      <Link
        href={ABOUT_LINKS.home}
        className="about-display flex items-center gap-2 text-xl font-black text-[#7C3AED] no-underline sm:text-[22px]"
      >
        🎯 mission-card
      </Link>
      <Link
        href={ABOUT_LINKS.home}
        className="about-display about-brutal-sm rounded-full bg-[#FCD34D] px-5 py-2.5 text-sm font-black text-[#1F1035] no-underline transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#1F1035] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#1F1035]"
      >
        🚀 無料ではじめる
      </Link>
    </nav>
  );
}
