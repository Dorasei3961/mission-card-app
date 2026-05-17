import { TopSectionHeading } from "./top-section-heading";

const USE_CASES = [
  { emoji: "🃏", label: "ポケカ交流会" },
  { emoji: "🍻", label: "オフ会" },
  { emoji: "🏫", label: "文化祭" },
  { emoji: "💜", label: "推し活" },
  { emoji: "🎂", label: "誕生日会" },
  { emoji: "📚", label: "学園祭" },
  { emoji: "🏢", label: "社内イベント" },
  { emoji: "🥳", label: "飲み会" },
] as const;

export function TopUseCases() {
  return (
    <section className="top-fade-up mt-16">
      <TopSectionHeading
        title="こんなイベントで使えます"
        subtitle="オフラインもオンラインも、みんなの集まりに"
      />

      <ul className="mt-6 flex flex-wrap justify-center gap-2">
        {USE_CASES.map((item) => (
          <li
            key={item.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-white/90 px-3.5 py-2 text-sm font-bold text-gray-800 shadow-sm transition hover:border-[#7C3AED]/30 hover:bg-violet-50"
          >
            <span aria-hidden>{item.emoji}</span>
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
