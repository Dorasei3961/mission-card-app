/** ヒーロー用のモックUIカード（装飾のみ） */

export function TopMockCards() {
  return (
    <div className="relative mx-auto mt-10 h-[220px] w-full max-w-[300px]" aria-hidden>
      <div className="top-float-delay-2 absolute left-0 top-8 z-[1] w-[148px] -rotate-6 rounded-[24px] border border-gray-100 bg-white p-3 shadow-md">
        <p className="text-[10px] font-bold text-[#7C3AED]">ビンゴ</p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {["B", "I", "N", "G", "O", "★"].map((c, i) => (
            <span
              key={i}
              className={`flex aspect-square items-center justify-center rounded-md text-[9px] font-black ${
                c === "★" ? "bg-[#7C3AED] text-white" : "bg-[#EDE9FE] text-[#7C3AED]"
              }`}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="top-float-delay-3 absolute right-0 top-2 z-[2] w-[132px] rotate-6 rounded-[24px] border border-gray-100 bg-white p-3 shadow-md">
        <p className="text-[10px] font-bold text-[#7C3AED]">クイズ</p>
        <p className="mt-2 text-xs font-bold text-gray-900">正解は？</p>
        <div className="mt-2 space-y-1">
          <div className="rounded-lg bg-[#EDE9FE] px-2 py-1 text-[9px] font-semibold text-[#7C3AED]">A</div>
          <div className="rounded-lg bg-gray-50 px-2 py-1 text-[9px] text-gray-400">B</div>
        </div>
      </div>

      <div className="top-float absolute left-1/2 top-0 z-[3] w-[168px] -translate-x-1/2 rounded-[28px] border border-gray-100 bg-white p-3.5 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-lg">
            🎯
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-[#7C3AED]">ミッション</p>
            <p className="truncate text-xs font-bold text-gray-900">交流チャレンジ</p>
          </div>
        </div>
        <p className="mt-2 text-lg font-black text-[#F59E0B]">+20 pt</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-2/3 rounded-full bg-[#7C3AED]" />
        </div>
      </div>

      <div className="top-float-delay-1 absolute bottom-0 left-1/2 z-[4] w-[120px] -translate-x-1/2 rounded-full border-4 border-[#7C3AED] bg-white p-2 shadow-md">
        <p className="text-center text-[9px] font-bold text-[#7C3AED]">ルーレット</p>
        <div
          className="mx-auto mt-1 h-14 w-14 rounded-full"
          style={{
            background: `conic-gradient(from -90deg, #FDE68A 0deg 90deg, #A78BFA 90deg 180deg, #7C3AED 180deg 270deg, #EDE9FE 270deg 360deg)`,
          }}
        />
      </div>
    </div>
  );
}
