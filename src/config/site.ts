export const siteConfig = {
  name: "SoloBase",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://solobase.app",
  description: "发现值得关注的个人产品 — 每周精选有启发的独立产品和 maker 故事",
  defaultOgImage: "/og-default.png",
  pagination: {
    defaultPageSize: 20,
    maxPageSize: 100,
  },
  locale: "zh-CN",
} as const;
