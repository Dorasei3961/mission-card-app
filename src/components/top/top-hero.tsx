import Link from "next/link";
import { TopMockCards } from "./top-mock-cards";

type Props = {
  /** 主CTAの遷移先（/about では / へ） */
  actionHref?: string;
};

export function TopHero({ actionHref = "/events/create" }: Props) {
  return (
    <section className="pt-10 text-center">
      <h1 className="text-[2rem] font-black leading-tight tracking-tight text-[#111827] sm:text-4xl">
        イベントをもっと
        <br />
        楽しく。
      </h1>
      <p className="mx-auto mt-4 max-w-[300px] text-sm leading-relaxed text-gray-500">
        ミッション・クイズ・ビンゴ・ルーレットで
        <br />
        参加型イベントを簡単に。
      </p>

      <Link
        href={actionHref}
        className="mt-8 inline-flex min-h-[52px] w-full max-w-[320px] items-center justify-center rounded-2xl bg-[#7C3AED] px-6 text-base font-bold text-white shadow-lg shadow-violet-200 transition active:scale-[0.98] touch-manipulation"
      >
        イベントを作成する
      </Link>

      <p className="mt-4 text-sm">
        <Link href="/events/join" className="font-semibold text-[#7C3AED] underline-offset-2 hover:underline">
          参加者の方はこちら
        </Link>
      </p>

      <TopMockCards />
    </section>
  );
}
