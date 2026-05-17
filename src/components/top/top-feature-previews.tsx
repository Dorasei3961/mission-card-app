/** 機能カード内のミニUIプレビュー（装飾のみ） */

export function PreviewMission() {
  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-white/90 p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-sm">
          🎯
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-[#7C3AED]">ミッション</p>
          <p className="truncate text-xs font-bold text-gray-800">あいさつチャレンジ</p>
        </div>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#7C3AED] text-white">
          ✓
        </span>
      </div>
      <p className="mt-2 text-base font-black text-[#F59E0B]">+10 pt</p>
    </div>
  );
}

export function PreviewQuiz() {
  return (
    <div className="mt-4 rounded-2xl border border-sky-100 bg-white/90 p-3 shadow-sm">
      <p className="text-[10px] font-bold text-sky-600">クイズ · リアルタイム</p>
      <p className="mt-1 text-xs font-bold text-gray-800">今日のテーマは？</p>
      <div className="mt-2 space-y-1">
        <div className="top-pulse-soft rounded-lg bg-sky-500 px-2 py-1.5 text-center text-[10px] font-bold text-white">
          A. みんなで盛り上がる！
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-1 text-center text-[10px] text-gray-400">
          B. わからない
        </div>
      </div>
    </div>
  );
}

export function PreviewBingo() {
  const cells = ["B", "I", "N", "G", "O", "★", "7", "3", "1"];
  return (
    <div className="mt-4 rounded-2xl border border-amber-100 bg-white/90 p-3 shadow-sm">
      <p className="text-[10px] font-bold text-amber-600">ビンゴ</p>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {cells.map((c, i) => (
          <span
            key={i}
            className={`flex aspect-square items-center justify-center rounded-md text-[9px] font-black ${
              c === "★" ? "bg-[#7C3AED] text-white top-pulse-soft" : "bg-amber-50 text-amber-800"
            }`}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PreviewRoulette() {
  return (
    <div className="mt-4 rounded-2xl border border-pink-100 bg-white/90 p-3 shadow-sm">
      <p className="text-center text-[10px] font-bold text-pink-500">ルーレット抽選中…</p>
      <div className="relative mx-auto mt-2 flex h-20 w-20 items-center justify-center">
        <div
          className="h-16 w-16 rounded-full border-4 border-white shadow-md top-spin-slow"
          style={{
            background: `conic-gradient(from -90deg, #FBCFE8 0deg 72deg, #FDE68A 72deg 144deg, #A78BFA 144deg 216deg, #7C3AED 216deg 288deg, #EDE9FE 288deg 360deg)`,
          }}
        />
        <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[#7C3AED]">▼</span>
      </div>
      <p className="mt-1 text-center text-[10px] font-bold text-gray-600">🎁 景品当たり！</p>
    </div>
  );
}

export type FeaturePreviewKind = "mission" | "quiz" | "bingo" | "roulette";

export function TopFeaturePreview({ kind }: { kind: FeaturePreviewKind }) {
  switch (kind) {
    case "mission":
      return <PreviewMission />;
    case "quiz":
      return <PreviewQuiz />;
    case "bingo":
      return <PreviewBingo />;
    case "roulette":
      return <PreviewRoulette />;
  }
}
