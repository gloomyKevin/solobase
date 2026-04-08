import type { Metadata } from "next";
import { Noto_Sans_SC, DM_Sans } from "next/font/google";
import { siteConfig } from "@/config/site";
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
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Solobase — 发现最值得关注的个人产品",
    template: "%s | Solobase",
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: siteConfig.name,
    images: [{ url: siteConfig.defaultOgImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
  },
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
      suppressHydrationWarning
      style={
        {
          "--font-sans":
            "var(--font-cn), var(--font-latin), 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
          "--font-mono":
            "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        } as React.CSSProperties
      }
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('solobase-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
