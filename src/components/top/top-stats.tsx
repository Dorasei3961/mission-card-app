import { TopSectionHeading } from "./top-section-heading";

/** デザイン用の勢い数字（実データ連携なし） */
const STATS = [
  { value: "1,200+", label: "累計イベント", emoji: "🎪" },
  { value: "8,500+", label: "参加ユーザー", emoji: "👥" },
  { value: "50,000+", label: "ミッション達成", emoji: "🎯" },
] as const;

export function TopStats() {
  return (
    <section className="top-fade-up mt-16">
      <TopSectionHeading title="みんなで使われています" subtitle="※ イメージ数値です" />

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className={`rounded-3xl border border-white/60 px-4 py-5 text-center text-white shadow-md ${
              i === 0 ? "top-fade-up-d1" : i === 1 ? "top-fade-up-d2" : "top-fade-up-d3"
            }`}
            style={{
              background: "linear-gradient(145deg, #7C3AED 0%, #A78BFA 100%)",
            }}
          >
            <span className="text-2xl" aria-hidden>
              {s.emoji}
            </span>
            <p className="mt-2 text-2xl font-black tabular-nums leading-none">{s.value}</p>
            <p className="mt-1 text-xs font-semibold opacity-90">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
