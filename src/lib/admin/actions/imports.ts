"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { fetchFeed, checkFeedUrl, FeedAccessError } from "@/lib/imports/feed";
import { enqueueJob } from "@/lib/jobs/queue";
import { approveItems, rejectItems, releaseApproved, releaseItems, removeItems, reprocessErrors, restoreItems, retryPhotoErrors, runImport, updateItem } from "@/lib/imports/pipeline";
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

/**
 * Re-checks the products in Error: auctions are accepted as bidding products, raw books are
 * accepted with the condition their listing states, and details that no sales channel requires
 * (publisher, year, grade, label, issue number) become Unknown instead of holding the product
 * back. Unknown publishers and years are then looked up from reference knowledge in the
 * background. Only a product without a title, price or photo, or one that is unavailable or
 * flagged as adult content, stays in Error.
 */
export async function fixErrorsAction(): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const photos = await retryPhotoErrors(IMPORT_SOURCE);
    const first = await reprocessErrors(IMPORT_SOURCE, { limit: 300 });
    // More than one batch continues in the background; either way the knowledge pass follows.
    await enqueueJob("import_fix", first.nextCursor ? { cursor: first.nextCursor } : { phase: "knowledge" }, { maxAttempts: 3 });
    await audit({ actor: actorOf(admin), action: "import.fix_errors", targetType: "import", summary: `Import errors re-checked: ${first.fixed} fixed, ${first.duplicates} duplicates, ${first.still} still need a person${first.nextCursor ? " (more in the background)" : ""}` });
    refresh();
    if (first.checked === 0 && photos > 0) return okState(undefined, `${photos} product(s) whose photo could not be stored are being prepared again; they become Ready to Release in a moment.`);
    if (first.checked === 0) return okState(undefined, "No products in Error to re-check (products you edited or already reviewed are left alone).");
    return okState(undefined, `${photos ? `${photos} photo error(s) sent back to preparation. ` : ""}${first.fixed} moved to Pending Review, ${first.duplicates} are duplicates, ${first.still} cannot be queued (no title, price or photo, unavailable, or adult content).${first.nextCursor ? " The rest is being checked in the background." : ""} Unknown publishers and years are now being looked up in the background.`);
  });
}

const SettingsSchema = z.object({
  discountPercent: z.coerce.number().min(0).max(99),
  autoPriceSync: zBool,
  feedUrl: z.string().trim().max(500),
  feedIsComplete: zBool,
  syncHours: z.coerce.number().int().min(1).max(720),
  autoReleasePerDay: z.coerce.number().int().min(0).max(20_000),
  autoReleaseIncludePending: zBool,
  autoReleaseHoldDuplicates: zBool,
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
    await saveSettings({ "imports.discountBps": Math.round(d.discountPercent * 100), "imports.autoPriceSync": d.autoPriceSync, "imports.feedUrl": d.feedUrl, "imports.feedIsComplete": d.feedIsComplete, "imports.syncHours": d.syncHours, "imports.autoReleasePerDay": d.autoReleasePerDay, "imports.autoReleaseIncludePending": d.autoReleaseIncludePending, "imports.autoReleaseHoldDuplicates": d.autoReleaseHoldDuplicates }, admin.id);
    if (d.autoReleasePerDay > 0) await enqueueJob("import_auto_release", {}, { dedupe: true, maxAttempts: 3 });
    await audit({ actor: actorOf(admin), action: "import.settings", targetType: "setting", summary: `Import settings: daily release ${d.autoReleasePerDay || "off"}${d.autoReleasePerDay ? (d.autoReleaseIncludePending ? " (including Pending Review)" : " (approved only)") : ""}, discount ${d.discountPercent}%, automatic price sync ${d.autoPriceSync ? "on" : "off"}, feed ${d.feedUrl ? "set" : "not set"}` });
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

/** Releases every approved product: the first batch now, the rest in the background until none is left. */
export async function releaseAllReadyAction(): Promise<ActionState> {
  return runAdmin("products.manage", async (admin) => {
    const cutoff = new Date();
    const waiting = await db.importItem.count({ where: { source: IMPORT_SOURCE, status: { in: ["approved", "ready"] } } });
    if (waiting === 0) return failState("Nothing is approved. Approve products first.");
    const r = await releaseApproved(IMPORT_SOURCE, cutoff, 60);
    if (r.remaining > 0) await enqueueJob("import_release_approved", { cutoff: cutoff.toISOString(), rounds: 0 }, { maxAttempts: 3 });
    await audit({ actor: actorOf(admin), action: "import.release", targetType: "import_item", summary: `Release all approved: ${r.released} released now, ${r.blocked} held back, ${r.remaining} continuing in the background` });
    refresh();
    return okState(undefined, `${r.released} released and now public${r.blocked ? `, ${r.blocked} held back by the release check (see Error)` : ""}${r.remaining ? `. The other ${r.remaining} approved product(s) are being released in the background` : ""}.`);
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
