export interface CategoryOption {
  value: string;
  label: string;
  description?: string;
}

export const businessModelOptions: CategoryOption[] = [
  { value: "subscription", label: "订阅制", description: "按月/年付费使用" },
  { value: "one_time", label: "一次性付费", description: "买断制" },
  { value: "freemium", label: "免费增值", description: "基础免费，高级付费" },
  { value: "ad_revenue", label: "广告变现", description: "通过广告获取收入" },
  { value: "commission", label: "佣金/抽成", description: "按交易抽成" },
  { value: "open_source_plus", label: "开源+付费", description: "开源核心，付费增值" },
  { value: "content_paid", label: "内容付费", description: "知识/内容付费" },
  { value: "undetermined", label: "待确认", description: "尚未确定商业模式" },
];

export const buildEffortOptions: CategoryOption[] = [
  { value: "weekend", label: "周末项目", description: "几天到一周可完成" },
  { value: "monthly", label: "月度项目", description: "一到几个月完成" },
  { value: "ongoing", label: "持续工程", description: "需要持续投入" },
  { value: "undetermined", label: "待确认" },
];

export const growthChannelOptions: CategoryOption[] = [
  { value: "seo", label: "SEO 驱动", description: "搜索引擎优化获客" },
  { value: "community", label: "社区驱动", description: "社区口碑传播" },
  { value: "content_marketing", label: "内容营销", description: "博客/视频/社媒内容" },
  { value: "paid_ads", label: "付费投放", description: "广告投放获客" },
  { value: "viral", label: "产品自传播", description: "产品内置传播机制" },
  { value: "mixed", label: "混合增长", description: "多渠道组合" },
  { value: "undetermined", label: "待确认" },
];

export const founderTypeOptions: CategoryOption[] = [
  { value: "tech_to_product", label: "技术转产品", description: "程序员做产品" },
  { value: "designer", label: "设计师", description: "设计师做产品" },
  { value: "product_manager", label: "产品经理", description: "产品经理创业" },
  { value: "non_tech_ai", label: "非技术 AI", description: "非技术人员借助 AI 构建" },
  { value: "small_team", label: "小团队", description: "2-5 人精干团队" },
  { value: "undetermined", label: "待确认" },
];

export const projectStageOptions: CategoryOption[] = [
  { value: "idea", label: "构思中", description: "想法阶段" },
  { value: "building", label: "开发中", description: "正在构建" },
  { value: "launched", label: "已上线", description: "产品已发布" },
  { value: "revenue", label: "有收入", description: "已产生收入" },
  { value: "scaling", label: "增长中", description: "用户和收入在增长" },
];

export const revenueRangeOptions: CategoryOption[] = [
  { value: "pre_revenue", label: "尚无收入" },
  { value: "under_1k", label: "< $1k/月" },
  { value: "1k_5k", label: "$1k - 5k/月" },
  { value: "5k_10k", label: "$5k - 10k/月" },
  { value: "10k_50k", label: "$10k - 50k/月" },
  { value: "50k_plus", label: "$50k+/月" },
];

// Stage color mapping (for card rendering)
export const stageColorMap: Record<string, string> = {
  idea: "#9CA3AF",
  building: "#F59E0B",
  launched: "#DB6B25",
  revenue: "#3B9B8B",
  scaling: "#6C4FD6",
};

// Lookup helpers
export function getCategoryLabel(
  options: CategoryOption[],
  value: string
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
