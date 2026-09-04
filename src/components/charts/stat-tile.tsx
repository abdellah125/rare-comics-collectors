import Link from "next/link";
import { CHART_INK, SERIES } from "@/components/charts/tokens";

/**
 * KPI stat tile: label, value, optional signed delta vs a named period and an
 * optional 12-point sparkline (de-emphasis gray, current point in the accent).
 */
export function StatTile({ label, value, delta, deltaLabel, upIsGood = true, trend, href, sub }: { label: string; value: string; delta?: number | null; deltaLabel?: string; upIsGood?: boolean; trend?: number[]; href?: string; sub?: string }) {
  const good = delta !== undefined && delta !== null && (upIsGood ? delta >= 0 : delta <= 0);
  const body = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-950">{value}</p>
      {sub && <p className="text-[12px] text-ink-500">{sub}</p>}
      {delta !== undefined && delta !== null && (
        <p className={`mt-1 text-[12px] font-medium ${good ? "text-[#006300]" : "text-rose-700"}`}>
          {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta).toFixed(1)}%{deltaLabel ? ` ${deltaLabel}` : ""}
        </p>
      )}
      {trend && trend.length > 1 && <Sparkline points={trend} />}
    </>
  );
  const cls = "block rounded-xl border border-ink-200 bg-white p-4 transition hover:border-brand-300";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...points);
  const x = (i: number) => (i / (points.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - (v / max) * (h - 4);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="mt-2" aria-hidden>
      <path d={d} fill="none" stroke={CHART_INK.deemphasis} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last])} r={4} fill={CHART_INK.surface} />
      <circle cx={x(last)} cy={y(points[last])} r={3} fill={SERIES[0]} />
    </svg>
  );
}
