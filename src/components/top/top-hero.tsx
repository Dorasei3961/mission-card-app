import Link from "next/link";
import { TopMockCards } from "./top-mock-cards";

type Props = {
  actionHref?: string;
};

export function TopHero({ actionHref = "/events/create" }: Props) {
  return (
    <section className="top-fade-up pt-8 text-center">
      <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-[#7C3AED] shadow-sm backdrop-blur-sm">
        <span aria-hidden>🎉</span>
        スマホだけでOK · 3分でイベント作成
      </div>

      <h1 className="mt-5 text-[2rem] font-black leading-tight tracking-tight text-[#111827] sm:text-4xl">
        イベントをもっと
        <br />
        <span className="bg-gradient-to-r from-[#7C3AED] to-[#A78BFA] bg-clip-text text-transparent">
          楽しく。
        </span>
      </h1>

      <p className="mx-auto mt-4 max-w-[300px] text-sm leading-relaxed text-gray-600">
        ミッション・クイズ・ビンゴ・ルーレットで
        <br />
        みんなで盛り上がれる参加型イベントに。
      </p>

      <Link
        href={actionHref}
        className="mt-7 inline-flex min-h-[52px] w-full max-w-[320px] items-center justify-center gap-2 rounded-2xl bg-[#7C3AED] px-6 text-base font-bold text-white shadow-lg shadow-violet-300/40 transition hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] touch-manipulation"
      >
        無料ではじめる 🚀
      </Link>

      <p className="mt-3 text-xs text-gray-500">交流会・オフ会・文化祭でも大活躍</p>

      <TopMockCards />
    </section>
  );
}
