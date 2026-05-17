import Link from "next/link";

type Props = {
  actionHref?: string;
};

export function TopCta({ actionHref = "/events/create" }: Props) {
  return (
    <section className="top-fade-up mt-16">
      <div
        className="relative overflow-hidden rounded-3xl px-6 py-8 text-center text-white shadow-xl"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 55%, #C4B5FD 100%)",
        }}
      >
        <span
          className="pointer-events-none absolute -right-4 -top-4 text-4xl opacity-30"
          aria-hidden
        >
          🎊
        </span>
        <span
          className="pointer-events-none absolute -bottom-2 -left-2 text-3xl opacity-30"
          aria-hidden
        >
          ✨
        </span>

        <h2 className="relative text-xl font-black leading-snug">みんなで盛り上がろう！</h2>
        <p className="relative mt-2 text-sm opacity-95">
          イベントをもっと楽しく。無料で、今すぐスタート。
        </p>
        <Link
          href={actionHref}
          className="relative mt-6 inline-flex min-h-[48px] w-full max-w-[280px] items-center justify-center gap-1 rounded-2xl bg-white px-6 text-base font-bold text-[#7C3AED] shadow-md transition hover:scale-[1.03] active:scale-[0.98] touch-manipulation"
        >
          無料ではじめる 🎉
        </Link>
        <p className="relative mt-3 text-xs opacity-80">スマホだけでOK · クレカ不要</p>
      </div>
    </section>
  );
}
