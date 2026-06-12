import { FeatureIconBox } from "../about/about-feature-icon";
import { TopFeaturePreview, type FeaturePreviewKind } from "./top-feature-previews";
import { TopSectionHeading } from "./top-section-heading";

const FEATURES: {
  kind: FeaturePreviewKind;
  title: string;
  description: string;
  tintBg: string;
  tintBorder: string;
  delayClass: string;
}[] = [
  {
    kind: "mission",
    title: "ミッション",
    description: "交流・参加・チャレンジをポイント化。達成のたびにワクワク！",
    tintBg: "linear-gradient(145deg, rgba(124,58,237,0.14) 0%, rgba(255,255,255,0.95) 55%)",
    tintBorder: "rgba(124, 58, 237, 0.22)",
    delayClass: "top-fade-up-d1",
  },
  {
    kind: "quiz",
    title: "クイズ",
    description: "リアルタイム回答で会場がひとつに。盛り上がり必至！",
    tintBg: "linear-gradient(145deg, rgba(14,165,233,0.14) 0%, rgba(255,255,255,0.95) 55%)",
    tintBorder: "rgba(14, 165, 233, 0.22)",
    delayClass: "top-fade-up-d2",
  },
  {
    kind: "bingo",
    title: "ビンゴ",
    description: "イベント定番をスマホで。ビンゴの歓声、そのまま再現。",
    tintBg: "linear-gradient(145deg, rgba(245,158,11,0.16) 0%, rgba(255,255,255,0.95) 55%)",
    tintBorder: "rgba(245, 158, 11, 0.28)",
    delayClass: "top-fade-up-d2",
  },
  {
    kind: "roulette",
    title: "ルーレット",
    description: "抽選・景品演出をかんたんに。パーティの目玉にも。",
    tintBg: "linear-gradient(145deg, rgba(244,114,182,0.14) 0%, rgba(255,255,255,0.95) 55%)",
    tintBorder: "rgba(244, 114, 182, 0.25)",
    delayClass: "top-fade-up-d3",
  },
];

export function TopFeatures() {
  return (
    <section className="mt-16">
      <TopSectionHeading
        title="できること"
        subtitle="イベントを盛り上げる4つの遊び"
      />

      <ul className="mt-8 flex flex-col gap-5">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className={`${f.delayClass} rounded-3xl border p-5 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md`}
            style={{
              background: f.tintBg,
              borderColor: f.tintBorder,
            }}
          >
            <FeatureIconBox
              kind={f.kind}
              alt={f.title}
              size={40}
              boxClassName="h-14 w-14 shadow-sm ring-1 ring-black/5"
            />
            <h3 className="mt-3 text-xl font-bold text-gray-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.description}</p>
            <TopFeaturePreview kind={f.kind} />
          </li>
        ))}
      </ul>
    </section>
  );
}
