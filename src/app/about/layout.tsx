import { Nunito } from "next/font/google";
import type { Metadata } from "next";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-about-display",
});

export const metadata: Metadata = {
  title: "mission-card | イベントをもっと楽しく",
  description: "ミッション・クイズ・ビンゴ・ルーレットで参加型イベントをかんたんに。",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${nunito.variable} about-lp font-sans`}>{children}</div>;
}
