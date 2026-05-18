import { Nunito } from "next/font/google";
import { siteMetadata } from "@/lib/site-metadata";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-about-display",
});

export const metadata = siteMetadata;

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${nunito.variable} about-lp font-sans`}>{children}</div>;
}
