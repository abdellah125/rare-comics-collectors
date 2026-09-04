import "server-only";

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams = {
  page: number;
  per: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  skip: number;
  get: (key: string) => string;
  /** Plain string map for building links that preserve the current filters. */
  params: Record<string, string | undefined>;
};

/** Normalises list-page search params: pagination, free-text search, sort with an allow-list. */
export function listParams(sp: SearchParams, opts: { defaultSort: string; sorts: readonly string[]; per?: number; defaultDir?: "asc" | "desc" }): ListParams {
  const str = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.toString().trim() ?? "";
  };
  const page = Math.max(1, Number.parseInt(str("page") || "1", 10) || 1);
  const per = Math.min(200, Math.max(10, Number.parseInt(str("per") || String(opts.per ?? 25), 10) || 25));
  const sort = opts.sorts.includes(str("sort")) ? str("sort") : opts.defaultSort;
  const dir: "asc" | "desc" = str("dir") === "asc" ? "asc" : str("dir") === "desc" ? "desc" : (opts.defaultDir ?? "desc");
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val && k !== "page") params[k] = val;
  }
  return { page, per, q: str("q"), sort, dir, skip: (page - 1) * per, get: str, params };
}

export function pageCount(total: number, per: number) {
  return Math.max(1, Math.ceil(total / per));
}

/** SQLite/Postgres-agnostic case-insensitive contains (Prisma mode:"insensitive" is Postgres-only). */
export function contains(value: string) {
  return { contains: value };
}

export function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export type DateRange = { from: Date; to: Date; key: string; label: string; days: number };

/** Preset date ranges shared by the dashboard and reports. */
export function resolveRange(key: string | undefined, custom?: { from?: string; to?: string }): DateRange {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  const startOf = (days: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days + 1);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  switch (key) {
    case "today":
      return { from: startOf(1), to: end, key, label: "Today", days: 1 };
    case "7d":
      return { from: startOf(7), to: end, key, label: "Last 7 days", days: 7 };
    case "90d":
      return { from: startOf(90), to: end, key, label: "Last 90 days", days: 90 };
    case "mtd": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { from, to: end, key, label: "Month to date", days: Math.max(1, Math.ceil((end.getTime() - from.getTime()) / 86_400_000)) };
    }
    case "ytd": {
      const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return { from, to: end, key, label: "Year to date", days: Math.max(1, Math.ceil((end.getTime() - from.getTime()) / 86_400_000)) };
    }
    case "custom": {
      const from = parseDate(custom?.from, startOf(30));
      const to = parseDate(custom?.to, end);
      to.setUTCHours(23, 59, 59, 999);
      return { from, to, key, label: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, days: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000)) };
    }
    default:
      return { from: startOf(30), to: end, key: "30d", label: "Last 30 days", days: 30 };
  }
}

export const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "mtd", label: "Month to date" },
  { key: "ytd", label: "Year to date" },
];

/** Buckets timestamps into day (≤ 31 days), week (≤ 180) or month labels. */
export function bucketize(range: DateRange): { labels: string[]; index: (d: Date) => number } {
  const mode = range.days <= 31 ? "day" : range.days <= 180 ? "week" : "month";
  const labels: string[] = [];
  const starts: number[] = [];
  const cursor = new Date(range.from);
  while (cursor.getTime() <= range.to.getTime()) {
    starts.push(cursor.getTime());
    labels.push(mode === "month" ? cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }) : cursor.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
    if (mode === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (mode === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return {
    labels,
    index: (d) => {
      const t = d.getTime();
      let i = 0;
      for (let k = 0; k < starts.length; k++) if (starts[k] <= t) i = k;
      return i;
    },
  };
}
