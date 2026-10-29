import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans_JP } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  weight: ["600", "800"],
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const plex = IBM_Plex_Sans_JP({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "mood mosaic",
  description: "その日の気分を色で1日1回記録し、1年分を1枚のモザイクで眺めるページ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F0E13",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={`${bricolage.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
