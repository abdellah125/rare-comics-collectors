"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { assertAdmin, can } from "@/lib/auth/session";
import { activeCrawl, advanceCrawl, crawlProgress, setCrawlStatus, startCrawl, type CrawlProgress } from "@/lib/imports/crawl";
import { fetchFeed, checkFeedUrl, FeedAccessError } from "@/lib/imports/feed";
import { enqueueJob } from "@/lib/jobs/queue";
import { approveItems, rejectItems, releaseItems, removeItems, restoreItems, runImport, updateItem } from "@/lib/imports/pipeline";
import { IMPORT_SOURCE } from "@/lib/imports/status";
import { getSettings, saveSettings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, zBool, zSlug, type ActionState } from "@/lib/validation";

const refresh = (id?: string) => {
  revalidatePath("/admin/imports");
  revalidatePath("/admin/imports/queue");
  if (id) revalidatePath(`/admin/imports/${id}`);
};

/** Upload one or more data files from the authorised source. Everything lands in the review queue. */
export async function uploadImportAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return failState("Choose at least one CSV or JSON file.");
    if (files.reduce((n, f) => n + f.size, 0) > 4 * 1024 * 1024) return failState("Upload at most 4 MB at a time (send the files in smaller groups).");
    const snapshot = formData.get("snapshot") === "on" && files.length === 1;
    const messages: string[] = [];
    let failed = 0;
    for (const file of files) {
      const run = await runImport({ source: IMPORT_SOURCE, kind: "csv_upload", fileName: file.name, text: await file.text(), snapshot, startedById: admin.id });
      if (run.status === "failed") failed += 1;
      messages.push(`${file.name}: ${run.message}`);
    }
    await audit({ actor: actorOf(admin), action: "import.upload", targetType: "import", summary: `Import upload: ${files.map((f) => f.name).join(", ").slice(0, 300)}` });
    refresh();
    const text = `${messages.join(" ")} New products go to the review queue; nothing was published.`;
    return failed === files.length ? failState(messages.join(" ")) : okState(undefined, text);
  });
}

/** Fetch the configured feed now instead of waiting for the scheduled sync. */
export async function syncNowAction(): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const settings = await getSettings();
    const feedUrl = settings["imports.feedUrl"].trim();
    if (!feedUrl) return failState("No feed address is configured. Upload a file, or save the feed address the source gave you.");
    try {
      const feed = await fetchFeed(feedUrl);
      const run = await runImport({ source: IMPORT_SOURCE, kind: "feed", fileName: feed.fileName, text: feed.text, snapshot: settings["imports.feedIsComplete"], startedById: admin.id });
      await audit({ actor: actorOf(admin), action: "import.sync", targetType: "import", targetId: run.id, summary: `Feed sync: ${run.message}` });
      refresh();
      return run.status === "failed" ? failState(run.message ?? "The sync failed.") : okState(undefined, run.message ?? "Sync finished.");
    } catch (err) {
      const message = err instanceof FeedAccessError ? err.message : "The sync failed. The error has been logged.";
      if (!(err instanceof FeedAccessError)) console.error("[import sync]", err);
      await db.importRun.create({ data: { source: IMPORT_SOURCE, kind: "feed", fileName: feedUrl.slice(0, 200), status: "failed", message, logJson: JSON.stringify([{ level: "error", text: message }]), startedById: admin.id, finishedAt: new Date() } });
      refresh();
      return failState(message);
    }
  });
}

/** Start the page-by-page import of the source's catalogue pages. */
export async function startCrawlAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const from = Number(formData.get("startPage"));
    const to = Number(formData.get("endPage"));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > 5000) return failState("Enter a first and last page (for example 1 and 208).");
    const crawl = await startCrawl(IMPORT_SOURCE, from, to, admin.id);
    await enqueueJob("import_crawl", {}, { dedupe: true, maxAttempts: 3 });
    await audit({ actor: actorOf(admin), action: "import.crawl_start", targetType: "import", targetId: crawl.id, summary: `Catalogue import started: pages ${crawl.startPage}–${crawl.endPage}` });
    refresh();
    return okState(undefined, `Importing pages ${crawl.startPage}–${crawl.endPage}. Products go to the review queue; nothing is published.`);
  });
}

export async function setCrawlStatusAction(id: string, status: "running" | "paused"): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    await setCrawlStatus(id, status);
    if (status === "running") await enqueueJob("import_crawl", {}, { dedupe: true, maxAttempts: 3 });
    await audit({ actor: actorOf(admin), action: `import.crawl_${status === "running" ? "resume" : "pause"}`, targetType: "import", targetId: id, summary: `Catalogue import ${status === "running" ? "resumed" : "paused"}` });
    refresh();
    return okState(undefined, status === "running" ? "Resumed." : "Paused. Pages already imported are kept.");
  });
}

/**
 * Called by the progress panel while it is open: processes the next page when it is due and
 * returns the numbers. The wait between pages is enforced inside advanceCrawl, so polling more
 * often never sends more requests to the source.
 */
export async function crawlTickAction(): Promise<CrawlProgress | null> {
  const admin = await assertAdmin("products.view");
  const before = await activeCrawl(IMPORT_SOURCE);
  if (!before) return null;
  const after = before.status === "running" && can(admin, "products.manage") ? ((await advanceCrawl(IMPORT_SOURCE)) ?? before) : before;
  return crawlProgress(after);
}

const SettingsSchema = z.object({
  discountPercent: z.coerce.number().min(0).max(99),
  autoPriceSync: zBool,
  feedUrl: z.string().trim().max(500),
  feedIsComplete: zBool,
  syncHours: z.coerce.number().int().min(1).max(720),
});

export async function saveImportSettingsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("settings.manage", async (admin) => {
    const parsed = SettingsSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.feedUrl) {
      try {
        checkFeedUrl(d.feedUrl);
      } catch (err) {
        return failState(err instanceof Error ? err.message : "The feed address is not valid.", { feedUrl: "Not valid" });
      }
    }
    await saveSettings({ "imports.discountBps": Math.round(d.discountPercent * 100), "imports.autoPriceSync": d.autoPriceSync, "imports.feedUrl": d.feedUrl, "imports.feedIsComplete": d.feedIsComplete, "imports.syncHours": d.syncHours }, admin.id);
    await audit({ actor: actorOf(admin), action: "import.settings", targetType: "setting", summary: `Import settings: discount ${d.discountPercent}%, automatic price sync ${d.autoPriceSync ? "on" : "off"}, feed ${d.feedUrl ? "set" : "not set"}` });
    refresh();
    return okState(undefined, "Saved. The discount applies to products imported from now on; existing queue items keep the discount they were imported with.");
  });
}

/** Approve, reject, release, restore or remove the selected queue items. */
export async function bulkImportAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const clean = [...new Set(ids)].filter((id) => typeof id === "string" && id.length <= 64).slice(0, 500);
    if (clean.length === 0) return failState("Select at least one product.");
    let message: string;
    if (actionId === "approve") {
      const r = await approveItems(clean, admin.id);
      message = `${r.approved} approved: ${r.ready} ready to release${r.queued ? `, ${r.queued} having their photo stored (ready in a moment)` : ""}${r.errors ? `, ${r.errors} with an error` : ""}${r.skipped ? `. ${r.skipped} skipped (only products in Pending Review can be approved)` : ""}.`;
    } else if (actionId === "reject") {
      message = `${await rejectItems(clean, admin.id)} rejected.`;
    } else if (actionId === "release") {
      const r = await releaseItems(clean);
      message = `${r.released} released and now public${r.blocked ? `, ${r.blocked} held back by the release check (see Error)` : ""}${r.skipped ? `. ${r.skipped} skipped: only products that are Ready to Release can be released` : ""}.`;
    } else if (actionId === "restore") {
      message = `${await restoreItems(clean)} moved back to Pending Review.`;
    } else if (actionId === "remove") {
      const r = await removeItems(clean);
      message = `${r.removed} removed from the queue${r.kept ? `, ${r.kept} kept (released products are managed under Listings)` : ""}.`;
    } else return failState("Unknown action.");
    await audit({ actor: actorOf(admin), action: `import.${actionId}`, targetType: "import_item", targetId: clean.length === 1 ? clean[0] : undefined, summary: `Import queue ${actionId}: ${clean.length} selected — ${message}` });
    refresh(clean.length === 1 ? clean[0] : undefined);
    return okState(undefined, message);
  });
}

/** Releases everything that is Ready to Release (up to 200 at a time). */
export async function releaseAllReadyAction(): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const ready = await db.importItem.findMany({ where: { source: IMPORT_SOURCE, status: "ready" }, select: { id: true }, orderBy: { reviewedAt: "asc" }, take: 200 });
    if (ready.length === 0) return failState("Nothing is ready to release. Approve products first.");
    const r = await releaseItems(ready.map((i) => i.id));
    await audit({ actor: actorOf(admin), action: "import.release", targetType: "import_item", summary: `Released all ready imports: ${r.released} released, ${r.blocked} held back` });
    refresh();
    return okState(undefined, `${r.released} released and now public${r.blocked ? `, ${r.blocked} held back by the release check` : ""}.`);
  });
}

const optional = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());
const EditSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1, "Required").max(160),
  issue: z.string().trim().min(1, "Required").max(20),
  publisher: z.string().trim().min(1, "Required").max(120),
  year: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.coerce.number().int().min(1900).max(2100).nullable()),
  grader: z.string().trim().min(1, "Required").max(20),
  grade: z.string().trim().min(1, "Required").max(10),
  label: z.string().trim().min(1).max(60),
  variant: optional(120),
  certNumber: optional(40),
  keyIssue: optional(300),
  summary: z.string().trim().max(600),
  description: z.string().trim().max(6000),
  slug: zSlug,
  price: z.preprocess((v) => (typeof v === "string" ? v.replace(/[$,\s]/g, "") : v), z.coerce.number().positive().max(10_000_000)),
  resetPrice: zBool,
  seoTitle: z.string().trim().max(200),
  seoDescription: z.string().trim().max(400),
  primaryKeyword: z.string().trim().max(120),
});

/** Save an edit of a queued product: facts, price and SEO fields. */
export async function saveImportItemAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const parsed = EditSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const { id, price, ...rest } = parsed.data;
    const result = await updateItem(id, { ...rest, retailPrice: Math.round(price * 100) });
    if (!result.ok) return failState(result.message);
    await audit({ actor: actorOf(admin), action: "import.edit", targetType: "import_item", targetId: id, summary: `Import item edited: ${rest.title} ${rest.issue}` });
    refresh(id);
    return okState(undefined, result.status === "error" ? "Saved. Some facts are still missing (see the list above)." : result.status === "pending_review" ? "Saved. The product is in Pending Review." : "Saved.");
  });
}
