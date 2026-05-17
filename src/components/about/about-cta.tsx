import Link from "next/link";
import { ABOUT_LINKS } from "./about-links";

export function AboutCta() {
  return (
    <div className="relative mx-4 mb-16 mt-4 sm:mx-6 sm:mb-20">
      <div className="about-brutal-lg relative overflow-hidden rounded-[32px] bg-[#7C3AED] px-6 py-12 text-center sm:px-10 sm:py-16">
        <p
          className="pointer-events-none absolute inset-x-0 -top-5 select-none overflow-hidden whitespace-nowrap text-[80px] tracking-widest opacity-[0.06]"
          aria-hidden
        >
          🎉🎊🎈🥳🎁🎶
        </p>
        <h2 className="about-display relative text-[clamp(1.75rem,4vw,2.75rem)] font-black text-white">
          🎈 今すぐイベントを始めよう！
        </h2>
        <p className="relative mt-3 text-base text-[#C4B5FD]">無料で作成・運営できます。登録不要でOK！</p>
        <Link
          href={ABOUT_LINKS.home}
          className="about-display about-brutal relative mt-9 inline-flex items-center gap-2.5 rounded-2xl bg-[#FCD34D] px-10 py-4.5 text-lg font-black text-[#1F1035] no-underline transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[9px_9px_0_#1F1035] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#1F1035]"
          style={{ boxShadow: "5px 5px 0 #1F1035" }}
        >
          🚀 無料ではじめる
        </Link>
      </div>
    </div>
  );
}
