import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wordmate · Office 与四级词汇陪练",
  description:
    "Office、四级与自定义词库自由切换，支持四选一练习、发音、复习与纠错。",
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
