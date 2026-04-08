export interface TagDefinition {
  value: string;
  label: string;
  namespace: string;
}

export const trackTags: TagDefinition[] = [
  { value: "ai", label: "AI 应用", namespace: "track" },
  { value: "devtools", label: "开发者工具", namespace: "track" },
  { value: "productivity", label: "效率工具", namespace: "track" },
  { value: "content", label: "内容创作", namespace: "track" },
  { value: "ecommerce", label: "电商工具", namespace: "track" },
  { value: "design", label: "设计工具", namespace: "track" },
  { value: "finance", label: "财务/发票", namespace: "track" },
  { value: "education", label: "教育/学习", namespace: "track" },
  { value: "health", label: "健康/习惯", namespace: "track" },
  { value: "social", label: "社交/社区", namespace: "track" },
  { value: "nocode", label: "零代码建站", namespace: "track" },
  { value: "monitoring", label: "监控/运维", namespace: "track" },
];

export const taskScenarioTags: TagDefinition[] = [
  { value: "cold-start", label: "冷启动打法", namespace: "taskScenario" },
  { value: "side-project", label: "副业启动", namespace: "taskScenario" },
  { value: "saas-launch", label: "SaaS 起步", namespace: "taskScenario" },
  { value: "global", label: "出海产品", namespace: "taskScenario" },
  { value: "content-to-product", label: "内容转产品", namespace: "taskScenario" },
];

export const platformTags: TagDefinition[] = [
  { value: "web", label: "Web 应用", namespace: "platform" },
  { value: "chrome-ext", label: "Chrome 插件", namespace: "platform" },
  { value: "miniapp", label: "小程序", namespace: "platform" },
  { value: "ios", label: "iOS", namespace: "platform" },
  { value: "android", label: "Android", namespace: "platform" },
  { value: "desktop", label: "桌面应用", namespace: "platform" },
  { value: "api", label: "API 服务", namespace: "platform" },
];

export const marketTags: TagDefinition[] = [
  { value: "global", label: "全球市场", namespace: "market" },
  { value: "china", label: "中国市场", namespace: "market" },
  { value: "sea", label: "东南亚", namespace: "market" },
];

export const allTags: TagDefinition[] = [
  ...trackTags,
  ...taskScenarioTags,
  ...platformTags,
  ...marketTags,
];

export function getTagLabel(value: string): string {
  return allTags.find((t) => t.value === value)?.label ?? value;
}
