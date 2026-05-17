const FEATURES = [
  {
    emoji: "🎯",
    title: "ミッション",
    description: "交流・参加・チャレンジをポイント化",
    tint: "rgba(124, 58, 237, 0.12)",
  },
  {
    emoji: "❓",
    title: "クイズ",
    description: "リアルタイムで盛り上がる",
    tint: "rgba(14, 165, 233, 0.12)",
  },
  {
    emoji: "🎱",
    title: "ビンゴ",
    description: "イベント定番機能をスマホ化",
    tint: "rgba(245, 158, 11, 0.14)",
  },
  {
    emoji: "🎡",
    title: "ルーレット",
    description: "抽選・景品演出を簡単に",
    tint: "rgba(167, 139, 250, 0.2)",
  },
] as const;

export function TopFeatures() {
  return (
    <section className="mt-16">
      <h2 className="text-center text-2xl font-black text-[#111827]">できること</h2>
      <p className="mt-2 text-center text-sm text-gray-500">イベントを盛り上げる4つの機能</p>

      <ul className="mt-8 flex flex-col gap-4">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
              style={{ backgroundColor: f.tint }}
              aria-hidden
            >
              {f.emoji}
            </span>
            <h3 className="mt-4 text-xl font-bold text-gray-900">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
