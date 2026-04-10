/**
 * Template C: 大图宣言 (Hero Screenshot)
 * Full-bleed background with dark gradient, large white text, metric strip.
 */

import { colors, stageColors } from "../../tokens";
import { LogoWatermark } from "../primitives/LogoWatermark";
import type { CardData } from "../../types";

const stageLabels: Record<string, string> = {
  idea: "构思中",
  building: "开发中",
  launched: "已上线",
  revenue: "有收入",
  scaling: "增长中",
};

export function TemplateC({ data }: { data: CardData }) {
  const stageBg = stageColors[data.stage || "launched"] || "#9CA3AF";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "#1a1816",
        fontFamily: "Noto Sans SC",
        position: "relative",
      }}
    >
      {/* Background image (faded) */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.35,
        }}
      >
        {data.screenshotUrl ? (
          <img
            src={data.screenshotUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              background: `linear-gradient(135deg, ${colors.muted} 0%, ${colors.surfaceSunken} 100%)`,
            }}
          />
        )}
      </div>

      {/* Dark gradient overlay */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(180deg, rgba(26,24,22,0.15) 0%, rgba(26,24,22,0.55) 45%, rgba(26,24,22,0.95) 100%)",
        }}
      />

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "48px 40px",
          flexGrow: 1,
          position: "relative",
        }}
      >
        {/* Stage pill */}
        {data.stage && (
          <div
            style={{
              display: "flex",
              fontSize: 14,
              fontWeight: 600,
              padding: "5px 18px",
              borderRadius: 100,
              color: "white",
              background: stageBg,
              width: "fit-content",
              marginBottom: 16,
            }}
          >
            {data.stageLabel || stageLabels[data.stage] || data.stage}
          </div>
        )}

        {/* Product name */}
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 700,
            color: "white",
            lineHeight: 1.2,
            marginBottom: 12,
          }}
        >
          {data.name}
        </div>

        {/* Insight */}
        {data.insight && (
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.7,
              marginBottom: 28,
            }}
          >
            {data.insight}
          </div>
        )}

        {/* Metrics strip */}
        {data.metrics.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 28,
              paddingTop: 22,
              borderTop: "1px solid rgba(255,255,255,0.15)",
              marginBottom: 16,
            }}
          >
            {data.metrics.slice(0, 4).map((m, i) => (
              <div key={m.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.5)",
                    textTransform: "uppercase" as const,
                    letterSpacing: 0.5,
                  }}
                >
                  {m.label}
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: i === 0 ? colors.primary : i === 1 ? colors.secondary : "white",
                  }}
                >
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Watermark */}
        <LogoWatermark color="rgba(255,255,255,0.3)" />
      </div>
    </div>
  );
}
