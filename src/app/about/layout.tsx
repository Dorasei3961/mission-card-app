import { Nunito } from "next/font/google";
import type { Metadata } from "next";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-about-display",
});

export const metadata: Metadata = {
  title: "mission-card | イベントをもっと楽しくする参加型Webアプリ",
  description:
    "ミッション・クイズ・ビンゴ・ルーレットをスマホで簡単開催。交流会・オフ会・文化祭などを盛り上げる参加型Webアプリ。",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${nunito.variable} about-lp font-sans`}>{children}</div>;
}
