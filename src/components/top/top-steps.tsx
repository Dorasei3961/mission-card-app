import { TopSectionHeading } from "./top-section-heading";

const STEPS = [
  {
    step: 1,
    emoji: "✨",
    title: "イベントを作成",
    description: "機能をえらぶだけ。3分で準備OK。",
  },
  {
    step: 2,
    emoji: "📱",
    title: "参加者が参加",
    description: "QRやURLでスマホからサクッと参加。",
  },
  {
    step: 3,
    emoji: "🎉",
    title: "みんなで遊ぶ",
    description: "ミッションやクイズで会場が一体に！",
  },
] as const;

export function TopSteps() {
  return (
    <section className="mt-16">
      <TopSectionHeading title="かんたん3ステップ" subtitle="はじめてでもすぐ使えます" />

      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map((s) => (
          <li
            key={s.step}
            className="flex gap-4 rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm backdrop-blur-sm transition hover:shadow-md"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#A78BFA] text-lg font-black text-white shadow-md">
              {s.step}
              <span className="absolute -right-1 -top-1 text-sm" aria-hidden>
                {s.emoji}
              </span>
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-xs font-bold tracking-wide text-[#7C3AED]">STEP {s.step}</p>
              <h3 className="mt-1 text-lg font-bold text-gray-900">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{s.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
