import Link from "next/link";
import { ABOUT_LINKS } from "./about-links";

export function AboutFooter() {
  return (
    <footer className="bg-[#1F1035] px-4 py-8 text-center sm:px-6">
      <p className="about-display mb-4 text-xl font-black text-[#FCD34D]">🎯 mission-card</p>
      <nav className="mb-4 flex flex-wrap justify-center gap-6">
        <Link
          href={ABOUT_LINKS.home}
          className="text-[13px] text-[#9CA3AF] no-underline transition hover:text-[#FCD34D]"
        >
          トップへ
        </Link>
        <Link
          href={ABOUT_LINKS.terms}
          className="text-[13px] text-[#9CA3AF] no-underline transition hover:text-[#FCD34D]"
        >
          利用規約
        </Link>
        <Link
          href={ABOUT_LINKS.privacy}
          className="text-[13px] text-[#9CA3AF] no-underline transition hover:text-[#FCD34D]"
        >
          プライバシー
        </Link>
      </nav>
      <p className="text-xs text-[#4B5563]">© mission-card</p>
    </footer>
  );
}
