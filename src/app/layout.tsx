import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Learning App",
  description: "Shanghai Middle School English Improvement",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
