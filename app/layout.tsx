import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wordmate · Office 英文界面词汇陪练",
  description:
    "面向 Word、Excel 和 PowerPoint 英文界面的四选一词汇练习工具，支持发音、复习与纠错。",
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
