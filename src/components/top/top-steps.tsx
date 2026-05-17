const STEPS = [
  { step: 1, title: "イベントを作成", description: "機能を選んで、すぐに準備完了。" },
  { step: 2, title: "参加者が参加", description: "QRやURLで、スマホから参加。" },
  { step: 3, title: "みんなで遊ぶ", description: "ミッションやクイズで一体感をつくる。" },
] as const;

export function TopSteps() {
  return (
    <section className="mt-16">
      <h2 className="text-center text-2xl font-black text-[#111827]">かんたん3ステップ</h2>
      <p className="mt-2 text-center text-sm text-gray-500">はじめてでもすぐ使えます</p>

      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map((s) => (
          <li
            key={s.step}
            className="flex gap-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#7C3AED] text-lg font-black text-white">
              {s.step}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7C3AED]">
                STEP{s.step}
              </p>
              <h3 className="mt-1 text-lg font-bold text-gray-900">{s.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{s.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
