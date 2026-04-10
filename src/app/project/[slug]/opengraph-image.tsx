import { ImageResponse } from "next/og";
import { getDataService } from "@/services/data";
import { projectToCardData } from "@/lib/card-image/utils";
import { loadFonts } from "@/lib/card-image/fonts";
import { colors, stageColors } from "@/lib/card-image/tokens";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400; // 24h

const siteHost = new URL(siteConfig.url).host;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dataService = getDataService();
  const project = await dataService.getProject(slug);

  if (!project) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: colors.background,
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            color: colors.foreground,
            fontFamily: "Noto Sans SC",
          }}
        >
          Solobase
        </div>
      ),
      { ...size }
    );
  }

  const data = projectToCardData(project);
  const stageBg = stageColors[project.stage] || "#9CA3AF";
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: colors.background,
          padding: "40px 48px 32px",
          fontFamily: "Noto Sans SC",
        }}
      >
        {/* Top: brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 24,
            fontSize: 14,
            color: colors.mutedForeground,
            fontWeight: 500,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: colors.primary,
            }}
          />
          <span style={{ fontFamily: "DM Sans", letterSpacing: 1 }}>SOLOBASE</span>
        </div>

        {/* Name + stage */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 40, fontWeight: 700, color: colors.foreground }}>
            {data.name}
          </div>
          {data.stageLabel && (
            <div
              style={{
                display: "flex",
                fontSize: 14,
                fontWeight: 600,
                padding: "4px 16px",
                borderRadius: 100,
                color: "white",
                background: stageBg,
              }}
            >
              {data.stageLabel}
            </div>
          )}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 20,
            color: colors.mutedForeground,
            marginBottom: 20,
            lineHeight: 1.5,
          }}
        >
          {data.tagline}
        </div>

        {/* Insight */}
        {data.insight && (
          <div
            style={{
              display: "flex",
              borderLeft: `3px solid ${colors.primary}`,
              padding: "12px 18px",
              marginBottom: 20,
              fontSize: 17,
              fontWeight: 500,
              color: colors.foreground,
              lineHeight: 1.6,
            }}
          >
            {data.insight}
          </div>
        )}

        {/* Spacer */}
        <div style={{ display: "flex", flexGrow: 1 }} />

        {/* Metrics row */}
        {data.metrics.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {data.metrics.slice(0, 3).map((m) => (
              <div
                key={m.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: colors.muted,
                  borderRadius: 100,
                  padding: "8px 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: colors.mutedForeground,
                }}
              >
                {m.icon && <span>{m.icon}</span>}
                <span style={{ color: colors.primary, fontWeight: 700 }}>{m.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom line */}
        <div
          style={{
            display: "flex",
            borderTop: `1px solid ${colors.border}`,
            paddingTop: 12,
            fontSize: 13,
            color: colors.mutedForeground,
          }}
        >
          {siteHost}/project/{slug}
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
