import Link from "next/link";
import { ABOUT_LINKS } from "./about-links";

const FLOAT_CARDS = [
  { emoji: "🎯", label: "ミッション", pt: "+20 pt", bg: "#EDE9FE", delay: "about-fade-up-d4" },
  { emoji: "❓", label: "クイズ", pt: null, bg: "#DBEAFE", delay: "about-fade-up-d5" },
  { emoji: "🎱", label: "ビンゴ", pt: null, bg: "#D1FAE5", delay: "about-fade-up-d6" },
  { emoji: "🎡", label: "ルーレット", pt: null, bg: "#FEF3C7", delay: "about-fade-up-d7" },
] as const;

function HeroBlobs() {
  return (
    <>
      <div
        className="about-blob pointer-events-none absolute -left-[100px] -top-[100px] h-[400px] w-[400px] rounded-full bg-[#A78BFA] opacity-35 blur-[60px]"
        style={{ animationDuration: "7s" }}
      />
      <div
        className="about-blob pointer-events-none absolute -right-20 top-[30%] h-[320px] w-[320px] rounded-full bg-[#FCD34D] opacity-35 blur-[60px]"
        style={{ animationDuration: "9s", animationDelay: "1s" }}
      />
      <div
        className="about-blob pointer-events-none absolute bottom-[-60px] left-[20%] h-[280px] w-[280px] rounded-full bg-[#F472B6] opacity-35 blur-[60px]"
        style={{ animationDuration: "8s", animationDelay: "2s" }}
      />
      <div
        className="about-blob pointer-events-none absolute bottom-[10%] right-[10%] h-[200px] w-[200px] rounded-full bg-[#34D399] opacity-35 blur-[60px]"
        style={{ animationDuration: "6s", animationDelay: "0.5s" }}
      />
    </>
  );
}

export function AboutHero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 pb-20 pt-[100px] text-center sm:px-6 sm:pt-[120px]">
      <HeroBlobs />

      <div className="relative z-[1] mx-auto max-w-[760px]">
        <div className="about-display about-pop-in about-brutal-sm mb-7 inline-flex items-center gap-2 rounded-full bg-white px-5 py-1.5 text-sm font-extrabold text-[#7C3AED]">
          🎉 無料で今すぐ使える！
        </div>

        <h1 className="about-display about-fade-up-d1 mb-5 text-[clamp(2.75rem,9vw,5.5rem)] font-black leading-[1.05] tracking-tight text-[#1F1035]">
          イベントを
          <br />
          <span className="about-display mt-1 inline-block rotate-[-1.5deg] rounded-lg bg-[#FCD34D] px-3">
            もっと楽しく。
          </span>
        </h1>

        <p className="about-fade-up-d2 mb-10 text-lg leading-relaxed text-[#6B7280]">
          ミッション・クイズ・ビンゴ・ルーレットで
          <br />
          参加型イベントをかんたんに作れます 🙌
        </p>

        <div className="about-fade-up-d3 mb-16 flex flex-wrap justify-center gap-3.5">
          <Link
            href={ABOUT_LINKS.home}
            className="about-display about-brutal inline-flex items-center gap-2 rounded-2xl bg-[#7C3AED] px-8 py-4 text-base font-black text-white no-underline transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#1F1035] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#1F1035] sm:text-[17px]"
          >
            🚀 イベントを作成する
          </Link>
          <Link
            href={ABOUT_LINKS.join}
            className="about-display about-brutal inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-black text-[#1F1035] no-underline transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#1F1035] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#1F1035] sm:text-[17px]"
          >
            👋 参加者の方はこちら
          </Link>
        </div>

        <div className="about-fade-up-d4 flex flex-wrap justify-center gap-3.5">
          {FLOAT_CARDS.map((c) => (
            <div
              key={c.label}
              className={`about-display about-brutal ${c.delay} flex items-center gap-3 rounded-[20px] bg-white px-5 py-4 text-[15px] font-extrabold transition hover:-translate-y-1.5 hover:rotate-[-1deg]`}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[#1F1035] text-[22px]"
                style={{ backgroundColor: c.bg }}
              >
                {c.emoji}
              </span>
              <div className="text-left">
                <div>{c.label}</div>
                {c.pt ? (
                  <span className="mt-0.5 inline-block rounded-full border-[1.5px] border-[#F59E0B] bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-extrabold text-[#F59E0B]">
                    {c.pt}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
