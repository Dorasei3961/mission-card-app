/** ヒーロー用スマホモック＋浮遊カード（装飾のみ） */

export function TopMockCards() {
  return (
    <div className="relative mx-auto mt-8 w-full max-w-[320px]" aria-hidden>
      {/* スマホフレーム */}
      <div className="top-fade-up-d2 relative z-[5] mx-auto w-[200px] rounded-[28px] border-[6px] border-[#111827] bg-white p-2 shadow-2xl shadow-violet-200/50">
        <div className="mx-auto mb-2 h-4 w-16 rounded-full bg-gray-900" />
        <div className="overflow-hidden rounded-[20px] bg-[#FAF7FF] p-2">
          <p className="text-center text-[9px] font-bold text-[#7C3AED]">🎉 イベント開催中</p>
          <div className="top-float mt-2 rounded-2xl border border-violet-100 bg-white p-2 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🎯</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] font-bold text-gray-800">交流チャレンジ</p>
                <p className="text-[8px] text-gray-400">達成で +20pt</p>
              </div>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#7C3AED] text-[8px] text-white">
                ✓
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <div className="rounded-xl bg-sky-100/80 p-1.5 text-center">
              <p className="text-[8px] font-bold text-sky-700">クイズ</p>
              <p className="text-lg">❓</p>
            </div>
            <div className="rounded-xl bg-amber-100/80 p-1.5 text-center">
              <p className="text-[8px] font-bold text-amber-700">ビンゴ</p>
              <p className="text-lg">🎱</p>
            </div>
          </div>
          <div className="top-spin-slow mx-auto mt-2 h-12 w-12 rounded-full border-2 border-white shadow"
            style={{
              background: `conic-gradient(from -90deg, #FDE68A, #A78BFA, #7C3AED, #EDE9FE, #FBCFE8, #FDE68A)`,
            }}
          />
        </div>
      </div>

      {/* 浮遊カード */}
      <div className="top-float-rotate top-float-delay-2 absolute -left-1 top-16 z-[6] w-[118px] -rotate-12 rounded-2xl border border-amber-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm">
        <p className="text-[9px] font-bold text-amber-600">ビンゴ</p>
        <div className="mt-1 grid grid-cols-3 gap-0.5">
          {["B", "I", "★", "G", "O", "7"].map((c, i) => (
            <span
              key={i}
              className={`flex aspect-square items-center justify-center rounded text-[7px] font-black ${
                c === "★" ? "bg-[#7C3AED] text-white" : "bg-amber-50 text-amber-800"
              }`}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="top-float-rotate top-float-delay-3 absolute -right-1 top-10 z-[6] w-[110px] rotate-12 rounded-2xl border border-sky-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm">
        <p className="text-[9px] font-bold text-sky-600">クイズ</p>
        <p className="mt-1 text-[8px] font-bold text-gray-800">正解は…？</p>
        <div className="top-pulse-soft mt-1 rounded-md bg-sky-500 py-0.5 text-center text-[7px] font-bold text-white">
          みんなで拍手！
        </div>
      </div>

      <div className="top-wiggle top-float-delay-1 absolute bottom-2 right-4 z-[7] rounded-full border-2 border-pink-200 bg-white px-2 py-1 text-[10px] font-bold text-pink-500 shadow-md">
        🎁 当たり！
      </div>

      <div className="top-float top-float-delay-4 absolute bottom-6 left-2 z-[6] rounded-full bg-[#7C3AED] px-2.5 py-1 text-[10px] font-bold text-white shadow-md">
        +50 pt 🎉
      </div>
    </div>
  );
}
