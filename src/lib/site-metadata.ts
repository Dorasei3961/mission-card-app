import type { Metadata } from "next";

const SITE_TITLE = "イベチャレ | イベントをもっと楽しくする参加型Webアプリ";
const SITE_DESCRIPTION =
  "ミッション・クイズ・ビンゴ・ルーレットをスマホで簡単開催。交流会・オフ会・文化祭などを盛り上げる参加型Webアプリ。";

/** OGP / Twitter カード用の共通 metadata（/ と /about など） */
export const siteMetadata: Metadata = {
  metadataBase: new URL("https://mission-card-app.vercel.app"),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "イベチャレ",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: "イベチャレ — イベントをもっと楽しく",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/ogp.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "イベチャレ",
    statusBarStyle: "default",
  },
};
