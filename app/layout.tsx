import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "unduh — simpan video & audio youtube",
  description: "tempel tautan youtube, pratinjau, lalu simpan mp4 atau mp3. tanpa iklan, tanpa ribet.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full dark antialiased`}>
      <body className="min-h-full bg-[#09090b] text-zinc-100 flex flex-col">{children}</body>
    </html>
  );
}
