import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Rasterised app icon (/api/icon?size=180) for platforms that ignore SVG icons. */
export async function GET(request: NextRequest) {
  const settings = await getSettings();
  const size = Math.min(1024, Math.max(16, Number.parseInt(request.nextUrl.searchParams.get("size") ?? "180", 10) || 180));
  const initials = settings["marketplace.name"]
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: settings["marketplace.primaryColor"], color: "#fff", fontSize: Math.round(size * 0.42), fontWeight: 900, letterSpacing: "-0.04em", fontFamily: "sans-serif" }}>
        {initials}
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
