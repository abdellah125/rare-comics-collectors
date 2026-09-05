import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { site } from "@/lib/site";
import { getSettings } from "@/lib/settings";

/**
 * Dynamic Open Graph card: /api/og?title=…&subtitle=…&badge=…
 * Satori supports flexbox only — no CSS grid.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const settings = await getSettings().catch(() => null);
  const name = settings?.["marketplace.name"] ?? site.name;
  const tagline = settings?.["marketplace.tagline"] ?? site.tagline;
  const title = (searchParams.get("title") ?? name).slice(0, 110);
  const subtitle = (searchParams.get("subtitle") ?? tagline).slice(0, 140);
  const badge = (searchParams.get("badge") ?? name).slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0d1017 0%, #1c2130 55%, #881337 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#e11d48",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: -0.5,
            }}
          >
            RCC
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: -0.5 }}>{site.name}</span>
            <span style={{ fontSize: 14, letterSpacing: 3, color: "#8491a8", textTransform: "uppercase" }}>
              Comics · Grading · Services
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 16px",
              borderRadius: 999,
              background: "rgba(244,63,94,0.16)",
              border: "1px solid rgba(251,113,133,0.45)",
              color: "#fda4af",
              fontSize: 19,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 26,
            }}
          >
            {badge}
          </span>
          <span style={{ fontSize: 62, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{title}</span>
          <span style={{ fontSize: 26, color: "#b0b8c8", marginTop: 22, lineHeight: 1.4 }}>{subtitle}</span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.14)",
            paddingTop: 26,
            fontSize: 20,
            color: "#8491a8",
          }}
        >
          <span>{site.url.replace(/^https?:\/\//, "")}</span>
          <span>
            {site.address.city}, {site.address.region} · {site.phoneDisplay}
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
