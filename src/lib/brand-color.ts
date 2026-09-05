/**
 * Turns the admin's primary colour (Settings › General) into the CSS custom
 * properties Tailwind's brand utilities read, so one hex value re-skins every
 * button, link and accent. Shades are derived in HSL from the chosen 600 step.
 */
const DEFAULT_PRIMARY = "#e11d48";

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(Math.min(1, Math.max(0, l)) * 100).toFixed(1)}%)`;

/** Inline style for <html>; undefined when the default palette is in use. */
export function brandStyle(primary: string): Record<string, string> | undefined {
  if (!primary || primary.toLowerCase() === DEFAULT_PRIMARY) return undefined;
  const parsed = hexToHsl(primary);
  if (!parsed) return undefined;
  const [h, s, l] = parsed;
  return {
    "--color-brand-50": hsl(h, s, Math.max(l, 0.96)),
    "--color-brand-100": hsl(h, s, Math.max(l, 0.92)),
    "--color-brand-200": hsl(h, s, Math.max(l, 0.84)),
    "--color-brand-300": hsl(h, s, Math.max(l, 0.74)),
    "--color-brand-400": hsl(h, s, Math.min(0.9, l + 0.16)),
    "--color-brand-500": hsl(h, s, Math.min(0.9, l + 0.08)),
    "--color-brand-600": primary.toLowerCase(),
    "--color-brand-700": hsl(h, s, l - 0.08),
    "--color-brand-800": hsl(h, s, l - 0.16),
    "--color-brand-900": hsl(h, s, l - 0.24),
  };
}
