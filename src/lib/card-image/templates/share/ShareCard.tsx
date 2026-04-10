/**
 * Share Card template for project detail page sharing.
 * 1080×1080 (WeChat moments) or 1200×630 (OG).
 */

import { colors, stageColors, radius } from "../../tokens";
import { LogoWatermark } from "../primitives/LogoWatermark";
import type { CardData } from "../../types";

const stageLabels: Record<string, string> = {
  idea: "构思中",
  building: "开发中",
  launched: "已上线",
  revenue: "有收入",
  scaling: "增长中",
};

export function ShareCard({ data }: { data: CardData }) {
  const stageBg = stageColors[data.stage || "launched"] || "#9CA3AF";
  const stageLabel = data.stageLabel || stageLabels[data.stage || ""] || "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: colors.background,
        padding: "48px 44px 36px",
        fontFamily: "Noto Sans SC",
      }}
    >
      {/* Top bar: Solobase branding */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 36,
          fontSize: 14,
          color: colors.mutedForeground,
          fontWeight: 500,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: colors.primary,
          }}
        />
        <span style={{ fontFamily: "DM Sans", letterSpacing: 1 }}>SOLOBASE</span>
        <span style={{ marginLeft: 4 }}>精选推荐</span>
      </div>

      {/* Product name + stage */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: colors.foreground, lineHeight: 1.3 }}>
          {data.name}
        </div>
        {stageLabel && (
          <div
            style={{
              display: "flex",
              fontSize: 13,
              fontWeight: 600,
              padding: "4px 14px",
              borderRadius: 100,
              color: "white",
              background: stageBg,
            }}
          >
            {stageLabel}
          </div>
        )}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 20,
          color: colors.mutedForeground,
          lineHeight: 1.6,
          marginBottom: 28,
        }}
      >
        {data.tagline}
      </div>

      {/* Insight (if available) */}
      {data.insight && (
        <div
          style={{
            display: "flex",
            borderLeft: `3px solid ${colors.primary}`,
            padding: "14px 20px",
            marginBottom: 28,
            background: `linear-gradient(135deg, rgba(219,107,37,0.05) 0%, rgba(59,155,139,0.05) 100%)`,
            borderRadius: `0 ${radius.md}px ${radius.md}px 0`,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.6, color: colors.foreground }}>
            {data.insight}
          </div>
        </div>
      )}

      {/* Metrics */}
      {data.metrics.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
        >
          {data.metrics.slice(0, 4).map((m) => (
            <div
              key={m.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                background: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.lg,
                padding: "14px 20px",
                minWidth: 120,
              }}
            >
              <span style={{ fontSize: 12, color: colors.mutedForeground, fontWeight: 500 }}>
                {m.label}
              </span>
              <span style={{ fontSize: 22, fontWeight: 700, color: colors.primary }}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div style={{ display: "flex", flexGrow: 1 }} />

      {/* Bottom: URL + watermark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 16,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ fontSize: 14, color: colors.mutedForeground }}>
          {data.platformUrl || "solobase.app"}/project/{data.url ? new URL(data.url).hostname.replace("www.", "") : ""}
        </div>
        <LogoWatermark size={12} />
      </div>
    </div>
  );
}
