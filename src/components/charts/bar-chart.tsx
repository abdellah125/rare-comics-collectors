"use client";

import { useId, useState } from "react";
import { CHART_INK, SERIES, niceTicks, chartFormatter, type ChartFormat } from "@/components/charts/tokens";

/**
 * Single-series column chart. Columns ≤ 24px with a 4px rounded cap and a
 * square baseline, hairline grid, hover tooltip, selective cap labels (max and
 * last only) and a table view.
 */
export function BarChart({ labels, values, format = "number", height = 220, title, color = SERIES[0] }: { labels: string[]; values: number[]; format?: ChartFormat; height?: number; title: string; color?: string }) {
  const formatValue = chartFormatter(format);
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const width = 720;
  const pad = { top: 20, right: 16, bottom: 28, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...values);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const band = innerW / Math.max(1, labels.length);
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const maxIdx = values.indexOf(Math.max(...values));

  if (table) {
    return (
      <figure className="rounded-xl border border-ink-200 bg-white p-4">
        <figcaption className="mb-3 flex items-center justify-between text-sm font-semibold text-ink-950">
          {title}
          <button type="button" className="text-[12px] font-medium text-brand-700 underline" onClick={() => setTable(false)}>
            View chart
          </button>
        </figcaption>
        <table className="w-full text-[13px]">
          <tbody className="divide-y divide-ink-100">
            {labels.map((l, i) => (
              <tr key={l}>
                <td className="py-1 pr-3 text-ink-700">{l}</td>
                <td className="py-1 text-right tabular-nums text-ink-900">{formatValue(values[i] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    );
  }

  return (
    <figure className="rounded-xl border border-ink-200 bg-white p-4">
      <figcaption className="mb-2 flex items-center justify-between text-sm font-semibold text-ink-950">
        <span>{title}</span>
        <button type="button" className="text-[12px] font-medium text-brand-700 underline" onClick={() => setTable(true)}>
          View as table
        </button>
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
          {labels.map((l, i) => {
            const v = values[i] ?? 0;
            const cx = pad.left + band * i + band / 2;
            const h = Math.max(0, y(0) - y(v));
            const r = Math.min(4, h);
            const x0 = cx - barW / 2;
            const yTop = y(v);
            const path = h <= 0 ? "" : `M${x0},${y(0)} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${y(0)} Z`;
            const label = i === maxIdx || i === labels.length - 1;
            return (
              <g key={l} onMouseEnter={() => setHover(i)}>
                <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="transparent" />
                {path && <path d={path} fill={hover === i ? color : color} opacity={hover !== null && hover !== i ? 0.55 : 1} />}
                {label && v > 0 && (
                  <text x={cx} y={yTop - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={CHART_INK.secondary} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatValue(v)}
                  </text>
                )}
                {(labels.length <= 14 || i % Math.ceil(labels.length / 10) === 0) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART_INK.muted}>
                    {l}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-[12px] shadow-plate" style={{ left: `${Math.min(85, ((pad.left + band * hover) / width) * 100)}%` }} role="status">
            <p className="font-semibold text-ink-950">{labels[hover]}</p>
            <p className="tabular-nums text-ink-700">{formatValue(values[hover] ?? 0)}</p>
          </div>
        )}
      </div>
    </figure>
  );
}
