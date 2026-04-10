import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getDataService } from "@/services/data";
import { projectToCardData } from "@/lib/card-image/utils";
import { loadFonts } from "@/lib/card-image/fonts";
import { colors, stageColors, cardSizes } from "@/lib/card-image/tokens";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";

const siteHost = new URL(siteConfig.url).host;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const dataService = getDataService();
  const project = await dataService.getProject(slug);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const data = projectToCardData(project);
  const stageBg = stageColors[project.stage] || "#9CA3AF";
  const fonts = await loadFonts();

  const format = request.nextUrl.searchParams.get("format") || "wechat";
  const sizeKey = (["og", "wechat", "xiaohongshu"].includes(format) ? format : "wechat") as keyof typeof cardSizes;
  const { width, height } = cardSizes[sizeKey];

  return new ImageResponse(
    (
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
            fontSize: 16,
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
          <div style={{ fontSize: 40, fontWeight: 700, color: colors.foreground, lineHeight: 1.3 }}>
            {data.name}
          </div>
          {data.stageLabel && (
            <div
              style={{
                display: "flex",
                fontSize: 14,
                fontWeight: 600,
                padding: "5px 16px",
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
            fontSize: 22,
            color: colors.mutedForeground,
            lineHeight: 1.6,
            marginBottom: 28,
          }}
        >
          {data.tagline}
        </div>

        {/* Insight */}
        {data.insight && (
          <div
            style={{
              display: "flex",
              borderLeft: `4px solid ${colors.primary}`,
              padding: "16px 22px",
              marginBottom: 28,
              fontSize: 19,
              fontWeight: 500,
              color: colors.foreground,
              lineHeight: 1.7,
              borderRadius: "0 12px 12px 0",
              background: "linear-gradient(135deg, rgba(219,107,37,0.05) 0%, rgba(59,155,139,0.05) 100%)",
            }}
          >
            {data.insight}
          </div>
        )}

        {/* Metrics */}
        {data.metrics.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            {data.metrics.slice(0, 4).map((m) => (
              <div
                key={m.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  background: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 12,
                  padding: "14px 20px",
                  minWidth: 130,
                }}
              >
                <span style={{ fontSize: 13, color: colors.mutedForeground, fontWeight: 500 }}>
                  {m.label}
                </span>
                <span style={{ fontSize: 24, fontWeight: 700, color: colors.primary }}>
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
          <div style={{ fontSize: 15, color: colors.mutedForeground }}>{siteHost}/project/{slug}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: colors.mutedForeground,
              fontWeight: 500,
              letterSpacing: 1,
              fontFamily: "DM Sans",
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: colors.primary,
              }}
            />
            SOLOBASE
          </div>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    }
  );
}
