/**
 * Brand design tokens for card image generation.
 * All colors are hex (Satori doesn't support oklch).
 * Keep in sync with globals.css Warm Workshop palette.
 */

// Core palette
export const colors = {
  background: "#FBF8F3", // warm cream
  foreground: "#2A2725", // warm near-black
  card: "#FFFFFF",
  primary: "#DB6B25", // terracotta
  primaryForeground: "#FFFFFF",
  secondary: "#3B9B8B", // teal
  secondaryForeground: "#FFFFFF",
  accent: "#F0C030", // warm golden
  muted: "#F0EBE3", // warm sand
  mutedForeground: "#7D7570",
  border: "#DFD9D0",
  surfaceSunken: "#F3EEE6",
} as const;

// Stage colors (matching stageColorMap in categories.ts)
export const stageColors: Record<string, string> = {
  idea: "#9CA3AF",
  building: "#F59E0B",
  launched: "#DB6B25",
  revenue: "#3B9B8B",
  scaling: "#6C4FD6",
};

// Dimension tag colors (hex equivalents of oklch tag colors)
export const tagColors = {
  business: { bg: "#F8EDE3", text: "#8B4B1F" },
  growth: { bg: "#E3F3F0", text: "#2B6B5E" },
  effort: { bg: "#F8F0D8", text: "#7A6520" },
  founder: { bg: "#F0E3F5", text: "#6B3F80" },
  stage: { bg: "#E8EDF5", text: "#4A5580" },
  default: { bg: "#F0EBE3", text: "#6B5E50" },
} as const;

// Typography
export const fonts = {
  cn: "Noto Sans SC",
  en: "DM Sans",
} as const;

// Layout
export const radius = {
  sm: 7, // 0.45rem
  md: 10, // 0.6rem
  lg: 12, // 0.75rem (base)
  xl: 17, // 1.05rem
  "2xl": 22, // 1.35rem
} as const;

// Card sizes
export const cardSizes = {
  xiaohongshu: { width: 1080, height: 1440 }, // 3:4
  xiaohongshuSquare: { width: 1080, height: 1080 }, // 1:1
  og: { width: 1200, height: 630 }, // OG standard
  wechat: { width: 1080, height: 1080 }, // WeChat moments
} as const;
