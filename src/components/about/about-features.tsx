const FEATURES = [
  {
    emoji: "🎯",
    title: "ミッション",
    description:
      "交流・参加・チャレンジをポイント化。ゲーム感覚で参加者が自然と動き出します。",
    iconBg: "#EDE9FE",
  },
  {
    emoji: "❓",
    title: "クイズ",
    description:
      "リアルタイムで全員が参加するクイズ。会場が一体になる盛り上がりを体感して！",
    iconBg: "#DBEAFE",
  },
  {
    emoji: "🎱",
    title: "ビンゴ",
    description: "定番のビンゴをスマホでそのまま実現。カード配りも抽選機も不要です。",
    iconBg: "#D1FAE5",
  },
  {
    emoji: "🎡",
    title: "ルーレット",
    description:
      "景品演出や抽選をルーレットで華やかに。「誰が当たる？」のドキドキを演出。",
    iconBg: "#FEF3C7",
  },
] as const;

export function AboutFeatures() {
  return (
    <section className="relative bg-white px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6 sm:mb-[52px]">
          <div>
            <span className="about-display mb-4 inline-block rounded-full border-2 border-[#7C3AED] bg-white px-4 py-1 text-[13px] font-extrabold tracking-wide text-[#7C3AED]">
              🎊 できること
            </span>
            <h2 className="about-display text-[clamp(1.875rem,4.5vw,2.75rem)] font-black leading-tight text-[#1F1035]">
              イベントを盛り上げる
              <br />
              4つの機能{" "}
              <span className="about-wiggle inline-block" aria-hidden>
                ✨
              </span>
            </h2>
          </div>
          <p className="max-w-[500px] text-base leading-relaxed text-[#6B7280]">
            準備から当日まで、全部スマホひとつで完結。紙もアプリも不要です！
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="about-brutal cursor-default rounded-3xl bg-[#FFFBF0] p-6 transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_#1F1035] sm:p-7"
            >
              <span
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-[2.5px] border-[#1F1035] text-[26px]"
                style={{ backgroundColor: f.iconBg }}
                aria-hidden
              >
                {f.emoji}
              </span>
              <h3 className="about-display mb-2 text-xl font-black text-[#1F1035]">{f.title}</h3>
              <p className="text-sm leading-relaxed text-[#6B7280]">{f.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
