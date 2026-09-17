import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { getSettings } from "@/lib/settings";

/**
 * Release queue for catalogue imports (prisma/data/catalog-queue/*.json).
 *
 * The seed creates every queued listing as a draft with a `releaseAt` day. Drafts are
 * invisible to the storefront, the sitemap and the Merchant Center feed — all of them read
 * `publishedWhere` — so a listing only reaches Google once it is published, in stock and
 * buyable. The daily `catalog_release` job publishes what is due after re-checking it.
 */

type QueuedListing = {
  id: string;
  slug: string;
  title: string;
  issue: string;
  publisher: string;
  year: number;
  era: string;
  grader: string;
  grade: string;
  sku: string;
  price: number;
  stock: number;
  summary: string;
  description: string;
  certNumber: string | null;
  images: { url: string }[];
};

/** What would make a listing a broken page or a disapproved Merchant Center item. */
export function releaseProblems(p: QueuedListing): string[] {
  const problems: string[] = [];
  if (!p.title.trim()) problems.push("no title");
  if (!p.issue.trim()) problems.push("no issue");
  if (!p.publisher.trim()) problems.push("no publisher");
  if (!Number.isInteger(p.year) || p.year < 1900) problems.push("no publication year");
  if (!p.era.trim()) problems.push("no era");
  if (!p.grader.trim() || !p.grade.trim()) problems.push("no grade");
  if (!p.sku.trim()) problems.push("no SKU");
  if (!Number.isInteger(p.price) || p.price <= 0) problems.push("no price");
  if (p.stock <= 0) problems.push("out of stock");
  if (!p.summary.trim() || !p.description.trim()) problems.push("no description");
  if (!p.images[0]?.url) problems.push("no photo");
  return problems;
}

/** Shown on the dashboard: why a listing is or is not in /google-shopping-feed.xml right now. */
export function feedStatus(p: { status: string; stock: number; price: number; hasImage: boolean }): { inFeed: boolean; label: string } {
  if (p.status !== "published") return { inFeed: false, label: "Not submitted (not published yet)" };
  if (p.stock <= 0) return { inFeed: false, label: "Not submitted (sold / out of stock)" };
  if (!p.hasImage) return { inFeed: false, label: "Skipped by the feed (no photo)" };
  if (p.price <= 0) return { inFeed: false, label: "Skipped by the feed (no price)" };
  return { inFeed: true, label: "In the feed (in stock)" };
}

/** Just after midnight UTC, when the next day's batch falls due. */
export function nextReleaseRun(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5));
}

export async function releaseDueListings(now = new Date()): Promise<{ released: number; blocked: number; paused: boolean }> {
  const settings = await getSettings();
  if (settings["catalog.releasePaused"]) return { released: 0, blocked: 0, paused: true };

  const due = await db.product.findMany({
    where: { status: "draft", importSource: { not: null }, releaseAt: { lte: now }, deletedAt: null },
    include: { images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } },
    orderBy: [{ releaseAt: "asc" }, { createdAt: "asc" }],
    take: 500,
  });
  if (due.length === 0) return { released: 0, blocked: 0, paused: false };

  // A certification number identifies one physical slab: never publish a second listing for it.
  const certs = due.map((p) => p.certNumber).filter((c): c is string => Boolean(c));
  const live = certs.length ? await db.product.findMany({ where: { certNumber: { in: certs }, status: "published", deletedAt: null }, select: { certNumber: true } }) : [];
  const liveCerts = new Set(live.map((p) => p.certNumber));

  const ready: typeof due = [];
  let blocked = 0;
  for (const p of due) {
    const problems = releaseProblems(p);
    if (p.certNumber && liveCerts.has(p.certNumber)) problems.push(`certification number ${p.certNumber} is already on sale`);
    if (problems.length === 0) {
      ready.push(p);
      if (p.certNumber) liveCerts.add(p.certNumber);
      continue;
    }
    blocked += 1;
    const note = `Release check failed: ${problems.join("; ")}`;
    if (p.moderationNote !== note) await db.product.update({ where: { id: p.id }, data: { moderationNote: note } });
  }

  for (let i = 0; i < ready.length; i += 50) {
    await db.$transaction(
      ready.slice(i, i + 50).map((p, n) => db.product.update({ where: { id: p.id }, data: { status: "published", publishedAt: new Date(now.getTime() - (i + n) * 1000), moderationNote: null } })),
    );
  }
  if (ready.length > 0) {
    try {
      for (const path of ["/", "/store", "/google-shopping-feed.xml", "/sitemap.xml", "/sitemaps/site.xml", "/collections", "/publishers", "/characters"]) revalidatePath(path);
    } catch {
      // outside a request scope (polling worker): the documents' own revalidation window applies
    }
    for (let i = 0; i < ready.length; i += 100) {
      await enqueueJob("indexnow_ping", { paths: [...ready.slice(i, i + 100).map((p) => `/store/${p.slug}`), ...(i === 0 ? ["/store", "/collections", "/publishers"] : [])] }, { maxAttempts: 3 });
    }
  }
  console.log(`[release-queue] ${ready.length} published, ${blocked} blocked`);
  return { released: ready.length, blocked, paused: false };
}

export type ReleaseDay = { date: string; total: number; published: number; waiting: number };

export async function releaseQueueOverview() {
  const where = { importSource: { not: null }, deletedAt: null };
  const [byStatus, days, files, settings] = await Promise.all([
    db.product.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.product.groupBy({ by: ["releaseAt", "status"], where, _count: { _all: true }, orderBy: { releaseAt: "asc" } }),
    db.product.groupBy({ by: ["importFile", "status"], where, _count: { _all: true } }),
    getSettings(),
  ]);
  const schedule = new Map<string, ReleaseDay>();
  for (const d of days) {
    const date = d.releaseAt ? d.releaseAt.toISOString().slice(0, 10) : "unscheduled";
    const day = schedule.get(date) ?? { date, total: 0, published: 0, waiting: 0 };
    day.total += d._count._all;
    if (d.status === "published") day.published += d._count._all;
    if (d.status === "draft") day.waiting += d._count._all;
    schedule.set(date, day);
  }
  const perFile = new Map<string, { file: string; total: number; published: number; waiting: number }>();
  for (const f of files) {
    const file = f.importFile ?? "—";
    const row = perFile.get(file) ?? { file, total: 0, published: 0, waiting: 0 };
    row.total += f._count._all;
    if (f.status === "published") row.published += f._count._all;
    if (f.status === "draft") row.waiting += f._count._all;
    perFile.set(file, row);
  }
  const count = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  const total = byStatus.reduce((n, s) => n + s._count._all, 0);
  const upcoming = [...schedule.values()].filter((d) => d.waiting > 0);
  const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
  return {
    paused: settings["catalog.releasePaused"],
    total,
    published: count("published"),
    waiting: count("draft"),
    other: total - count("published") - count("draft"),
    schedule: [...schedule.values()],
    nextDay: upcoming[0] ?? null,
    lastDay: upcoming[upcoming.length - 1] ?? null,
    files: [...perFile.values()].sort((a, b) => natural(a.file, b.file)),
  };
}
