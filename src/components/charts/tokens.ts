import { formatMoney } from "@/lib/money";
/**
 * Chart palette — the validated reference categorical order (light surface).
 * Series colors sit on marks only; text always uses ink tokens.
 * Validated with the dataviz palette script against #ffffff.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;
export const SEQUENTIAL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#0d366b"] as const;
export const CHART_INK = { primary: "#0d1017", secondary: "#4e5a72", muted: "#8491a8", grid: "#eceef2", baseline: "#d5d9e2", surface: "#ffffff", deemphasis: "#c9d0dc" } as const;
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const;

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
  const step = candidates.find((c) => c >= rough) ?? candidates[candidates.length - 1];
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(0)}K`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export type ChartFormat = "number" | "money" | "moneyCompact" | "percent";
/** Serialisable value formatting so server components never pass functions to the chart. */
export function chartFormatter(format: ChartFormat): (v: number) => string {
  if (format === "money") return (v) => formatMoney(Math.round(v * 100));
  if (format === "moneyCompact") return (v) => formatMoney(Math.round(v * 100), "USD", "en-US", { compact: true });
  if (format === "percent") return (v) => `${v.toFixed(1)}%`;
  return (v) => v.toLocaleString("en-US");
}
