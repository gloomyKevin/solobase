/**
 * Template B: 数据卡片 (Data Grid)
 * Screenshot top half, 2x3 metrics grid bottom, tags at bottom.
 */

import { colors, tagColors, radius } from "../../tokens";
import { LogoWatermark } from "../primitives/LogoWatermark";
import { TagPill } from "../primitives/TagPill";
import type { CardData } from "../../types";

interface DataCell {
  label: string;
  value: string;
  accent?: boolean;
  teal?: boolean;
}

export function TemplateB({ data }: { data: CardData }) {
  // Build grid cells from metrics + classification
  const cells: DataCell[] = [];
  for (const m of data.metrics.slice(0, 6)) {
    cells.push({
      label: m.label,
      value: m.value,
      accent: cells.length === 0,
      teal: cells.length === 1,
    });
  }
  // Pad to at least 4 cells
  while (cells.length < 4) {
    cells.push({ label: "", value: "" });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: colors.background,
        fontFamily: "Noto Sans SC",
      }}
    >
      {/* Screenshot area with name overlay */}
      <div
        style={{
          display: "flex",
          position: "relative",
          height: 520,
          overflow: "hidden",
          background: colors.muted,
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
        {/* Gradient overlay with name */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px 36px",
            background: "linear-gradient(transparent, rgba(42,39,37,0.75))",
          }}
        >
          <div style={{ color: "white", fontSize: 30, fontWeight: 700 }}>
            {data.name}
          </div>
          <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 16, marginTop: 4 }}>
            {data.tagline}
          </div>
        </div>
      </div>

      {/* Data grid */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          flexGrow: 1,
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        {cells.slice(0, 6).map((cell, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              width: "50%",
              padding: "20px 28px",
              gap: 6,
              borderBottom: i < 4 ? `1px solid ${colors.border}` : "none",
              borderRight: i % 2 === 0 ? `1px solid ${colors.border}` : "none",
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: colors.mutedForeground,
                fontWeight: 500,
                textTransform: "uppercase" as const,
                letterSpacing: 0.5,
              }}
            >
              {cell.label}
            </span>
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: cell.accent
                  ? colors.primary
                  : cell.teal
                    ? colors.secondary
                    : colors.foreground,
              }}
            >
              {cell.value}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom bar: tags + watermark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 28px",
          borderTop: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {data.tags.slice(0, 3).map((tag) => (
            <TagPill key={tag.label} tag={tag} />
          ))}
        </div>
        <LogoWatermark size={12} />
      </div>
    </div>
  );
}
