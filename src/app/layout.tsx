import type { Metadata } from "next";
import { Noto_Sans_SC, DM_Sans } from "next/font/google";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-cn",
  display: "swap",
});

const dmSans = DM_Sans({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Solobase — 发现最值得关注的个人产品",
  description:
    "中文世界最有品味的个人产品发现平台。帮你在信息洪流中找到真正有启发的独立产品和 maker 故事。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSC.variable} ${dmSans.variable} h-full antialiased`}
      style={
        {
          "--font-sans":
            "var(--font-cn), var(--font-latin), 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
          "--font-mono":
            "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        } as React.CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
