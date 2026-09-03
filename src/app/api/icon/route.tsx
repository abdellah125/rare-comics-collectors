import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/**
 * Raster app icons: /api/icon?size=180|192|512[&maskable=1]
 * iOS ignores SVG touch icons and Android's install prompt wants 192/512 PNGs,
 * so the manifest and <link rel="apple-touch-icon"> point here.
 */
const SIZES = new Set([180, 192, 512]);

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const requested = Number(searchParams.get("size") ?? 512);
  const size = SIZES.has(requested) ? requested : 512;
  const maskable = searchParams.get("maskable") === "1";
  // Maskable icons are cropped to a safe zone by the OS, so keep the mark smaller and square.
  const radius = maskable ? 0 : Math.round(size * 0.16);
  const fontSize = Math.round(size * (maskable ? 0.26 : 0.33));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e11d48",
          borderRadius: radius,
          color: "#ffffff",
          fontFamily: "sans-serif",
          fontWeight: 900,
          fontSize,
          letterSpacing: -size * 0.01,
        }}
      >
        RCC
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
