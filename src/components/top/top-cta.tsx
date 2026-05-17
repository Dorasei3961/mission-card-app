import Link from "next/link";

type Props = {
  actionHref?: string;
};

export function TopCta({ actionHref = "/events/create" }: Props) {
  return (
    <section className="mt-16">
      <div
        className="rounded-3xl px-6 py-8 text-center text-white shadow-lg"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)",
        }}
      >
        <h2 className="text-xl font-black leading-snug">今すぐイベントを始めよう</h2>
        <p className="mt-2 text-sm opacity-90">無料で作成・運営できます</p>
        <Link
          href={actionHref}
          className="mt-6 inline-flex min-h-[48px] w-full max-w-[280px] items-center justify-center rounded-2xl bg-white px-6 text-base font-bold text-[#7C3AED] shadow-md transition active:scale-[0.98] touch-manipulation"
        >
          無料ではじめる
        </Link>
      </div>
    </section>
  );
}
