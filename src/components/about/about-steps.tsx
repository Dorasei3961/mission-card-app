const STEPS = [
  {
    num: "1",
    sticker: "STEP 1",
    stickerBg: "#7C3AED",
    title: "🛠️ イベントを作成",
    description: "使いたい機能を選んで、内容を入力するだけ。むずかしい設定は一切なし！",
  },
  {
    num: "2",
    sticker: "STEP 2",
    stickerBg: "#0EA5E9",
    title: "📲 参加者が参加",
    description:
      "QRコードかURLをシェアするだけ。アプリのインストール不要でスマホからすぐ参加できます。",
  },
  {
    num: "3",
    sticker: "STEP 3",
    stickerBg: "#10B981",
    title: "🎉 みんなで遊ぶ",
    description: "ミッションやクイズで一体感をつくろう。盛り上がること間違いなし！",
  },
] as const;

export function AboutSteps() {
  return (
    <section className="relative bg-[#FFFBF0] px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-[1080px]">
        <span className="about-display mb-4 inline-block rounded-full border-2 border-[#7C3AED] bg-white px-4 py-1 text-[13px] font-extrabold tracking-wide text-[#7C3AED]">
          🥳 かんたん3ステップ
        </span>
        <h2 className="about-display text-[clamp(1.875rem,4.5vw,2.75rem)] font-black leading-tight text-[#1F1035]">
          はじめてでも
          <br />
          すぐ使えます！
        </h2>

        <ol className="mt-12 grid grid-cols-1 gap-7 sm:mt-[52px] sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.num}
              className="relative overflow-hidden rounded-3xl border-[2.5px] border-[#1F1035] bg-white p-7 shadow-[5px_5px_0_#1F1035] transition hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[9px_9px_0_#1F1035] sm:p-8"
            >
              <span
                className="about-display pointer-events-none absolute right-5 top-3 text-[80px] font-black leading-none tracking-tighter text-[#F3F4F6]"
                aria-hidden
              >
                {s.num}
              </span>
              <span
                className="about-display relative mb-4 inline-block rounded-full px-3 py-1 text-[11px] font-extrabold tracking-wide text-white"
                style={{ backgroundColor: s.stickerBg }}
              >
                {s.sticker}
              </span>
              <h3 className="about-display relative mb-2.5 text-[22px] font-black text-[#1F1035]">
                {s.title}
              </h3>
              <p className="relative text-sm leading-relaxed text-[#6B7280]">{s.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
