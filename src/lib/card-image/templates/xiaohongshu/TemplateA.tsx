/**
 * Template A: 洞察聚光 (Editorial Clean)
 * Warm cream background, insight as focal point, screenshot + metric pills.
 */

import { colors, radius } from "../../tokens";
import { LogoWatermark } from "../primitives/LogoWatermark";
import { MetricPill } from "../primitives/MetricPill";
import { StageBadge } from "../primitives/StageBadge";
import type { CardData } from "../../types";

export function TemplateA({ data }: { data: CardData }) {
  const initial = (data.name || "S").charAt(0).toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: colors.background,
        padding: "48px 40px 36px",
        fontFamily: "Noto Sans SC",
      }}
    >
      {/* Header: icon + name + stage */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <div
          style={{
            display: "flex",
            width: 64,
            height: 64,
            borderRadius: radius.lg,
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 28,
            fontWeight: 700,
            fontFamily: "DM Sans",
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.3, color: colors.foreground }}>
            {data.name}
          </div>
          {data.stage && (
            <StageBadge stage={data.stage} label={data.stageLabel || ""} />
          )}
        </div>
      </div>

      {/* Insight block */}
      {data.insight && (
        <div
          style={{
            display: "flex",
            borderLeft: `4px solid ${colors.primary}`,
            borderRadius: `0 ${radius.lg}px ${radius.lg}px 0`,
            padding: "22px 28px",
            marginBottom: 28,
            background: `linear-gradient(135deg, rgba(219,107,37,0.06) 0%, rgba(59,155,139,0.06) 100%)`,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.7,
              color: colors.foreground,
            }}
          >
            {data.insight}
          </div>
        </div>
      )}

      {/* Screenshot area */}
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          borderRadius: radius.lg,
          overflow: "hidden",
          background: colors.muted,
          marginBottom: 22,
          minHeight: 200,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {data.screenshotUrl ? (
          <img
            src={data.screenshotUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ color: colors.mutedForeground, fontSize: 18 }}>
            {data.tagline || "产品截图"}
          </div>
        )}
      </div>

      {/* Metrics row */}
      {data.metrics.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {data.metrics.slice(0, 3).map((m) => (
            <MetricPill key={m.label} label={m.label} value={m.value} icon={m.icon} />
          ))}
        </div>
      )}

      {/* Watermark */}
      <LogoWatermark />
    </div>
  );
}
