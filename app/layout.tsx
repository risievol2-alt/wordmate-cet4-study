import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wordmate · 四级词汇陪练",
  description:
    "完整 CET-4 词库的四选一单词复习工具，支持发音、复习列表与纠错练习。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
