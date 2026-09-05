"use client";

import { useId, useState } from "react";
import { CHART_INK, SERIES, niceTicks, chartFormatter, type ChartFormat } from "@/components/charts/tokens";

export type LineSeries = { name: string; points: number[] };

/**
 * Multi-series line chart (≤ 4 series). 2px lines, ≥ 8px end markers with a
 * surface ring, hairline grid, crosshair + tooltip on hover, legend for ≥ 2
 * series, direct end labels, and a table view for accessibility.
 */
/** Which x labels to print: every Nth, plus the last one — dropping a neighbour that would collide with it. */
function showTick(i: number, n: number): boolean {
  const last = n - 1;
  if (n <= 12 || i === last) return true;
  const step = Math.ceil(n / 8);
  return i % step === 0 && last - i >= Math.max(1, Math.floor(step / 2));
}

export function LineChart({ labels, series, format = "number", height = 240, title }: { labels: string[]; series: LineSeries[]; format?: ChartFormat; height?: number; title: string }) {
  const formatValue = chartFormatter(format);
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const width = 720;
  const pad = { top: 16, right: 96, bottom: 28, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => pad.left + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const visible = series.slice(0, 4);

  if (table) {
    return (
      <figure className="rounded-xl border border-ink-200 bg-white p-4">
        <figcaption className="mb-3 flex items-center justify-between text-sm font-semibold text-ink-950">
          {title}
          <button type="button" className="text-[12px] font-medium text-brand-700 underline" onClick={() => setTable(false)}>
            View chart
          </button>
        </figcaption>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
              <tr>
                <th className="py-1 pr-3">Period</th>
                {visible.map((s) => (
                  <th key={s.name} className="py-1 pr-3 text-right">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {labels.map((l, i) => (
                <tr key={l}>
                  <td className="py-1 pr-3 text-ink-700">{l}</td>
                  {visible.map((s) => (
                    <td key={s.name} className="py-1 pr-3 text-right tabular-nums text-ink-900">
                      {formatValue(s.points[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    );
  }

  return (
    <figure className="rounded-xl border border-ink-200 bg-white p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-ink-950">
        <span>{title}</span>
        <span className="flex items-center gap-3">
          {visible.length > 1 && (
            <ul className="flex flex-wrap gap-3 text-[12px] font-medium text-ink-700" aria-label="Legend">
              {visible.map((s, i) => (
                <li key={s.name} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-[2px] w-4 rounded" style={{ background: SERIES[i] }} />
                  {s.name}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="text-[12px] font-medium text-brand-700 underline" onClick={() => setTable(true)}>
            View as table
          </button>
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-labelledby={`${id}-t`} onMouseLeave={() => setHover(null)}>
          <title id={`${id}-t`}>{title}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? CHART_INK.baseline : CHART_INK.grid} strokeWidth={1} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={CHART_INK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatValue(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) => showTick(i, labels.length) && (
            <text key={l} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART_INK.muted}>
              {l}
            </text>
          ))}
          {visible.map((s, si) => {
            const d = s.points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
            const last = s.points.length - 1;
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {last >= 0 && (
                  <>
                    <circle cx={x(last)} cy={y(s.points[last])} r={6} fill={CHART_INK.surface} />
                    <circle cx={x(last)} cy={y(s.points[last])} r={4} fill={SERIES[si]} />
                    <text x={x(last) + 10} y={y(s.points[last]) + 4} fontSize={11} fontWeight={600} fill={CHART_INK.secondary}>
                      {formatValue(s.points[last])}
                      {visible.length > 1 ? ` ${s.name}` : ""}
                    </text>
                  </>
                )}
              </g>
            );
          })}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke={CHART_INK.baseline} strokeWidth={1} />
              {visible.map((s, si) => (
                <g key={s.name}>
                  <circle cx={x(hover)} cy={y(s.points[hover] ?? 0)} r={6} fill={CHART_INK.surface} />
                  <circle cx={x(hover)} cy={y(s.points[hover] ?? 0)} r={4} fill={SERIES[si]} />
                </g>
              ))}
            </g>
          )}
          {labels.map((_, i) => (
            <rect key={i} x={x(i) - innerW / Math.max(1, labels.length - 1) / 2} y={pad.top} width={innerW / Math.max(1, labels.length - 1)} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] shadow-plate" style={{ left: `${Math.min(85, (x(hover) / width) * 100)}%` }} role="status">
            <p className="font-semibold text-ink-950">{labels[hover]}</p>
            {visible.map((s, si) => (
              <p key={s.name} className="flex items-center gap-1.5 text-ink-700">
                <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: SERIES[si] }} />
                {s.name}: <span className="tabular-nums text-ink-950">{formatValue(s.points[hover] ?? 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
