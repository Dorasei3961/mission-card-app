export type AboutFeatureItem = {
  title: string;
  description: string;
  iconBg: string;
  imageSrc: string;
};

export const ABOUT_FEATURES: readonly AboutFeatureItem[] = [
  {
    title: "ミッション",
    description:
      "交流・参加・チャレンジをポイント化。ゲーム感覚で参加者が自然と動き出します。",
    iconBg: "#EDE9FE",
    imageSrc: "/about/mission.svg",
  },
  {
    title: "クイズ",
    description:
      "リアルタイムで全員が参加するクイズ。会場が一体になる盛り上がりを体感して！",
    iconBg: "#DBEAFE",
    imageSrc: "/about/quiz.svg",
  },
  {
    title: "ビンゴ",
    description: "定番のビンゴをスマホでそのまま実現。カード配りも抽選機も不要です。",
    iconBg: "#D1FAE5",
    imageSrc: "/about/bingo.svg",
  },
  {
    title: "ルーレット",
    description:
      "景品演出や抽選をルーレットで華やかに。「誰が当たる？」のドキドキを演出。",
    iconBg: "#FEF3C7",
    imageSrc: "/about/roulette.svg",
  },
] as const;
