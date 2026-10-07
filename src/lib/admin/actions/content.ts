"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { saveSettings } from "@/lib/settings";
import { failState, okState, type ActionState } from "@/lib/validation";

/** Staff controls for the content pipeline: approve, reject, schedule, publish, unpublish, regenerate, and the dials. */

function refresh(slug?: string) {
  for (const p of ["/admin/content", "/admin/guides", "/guides", "/sitemap.xml", "/sitemaps/news.xml", ...(slug ? [`/guides/${slug}`] : [])]) revalidatePath(p);
}

/** Publishes an article now. It is announced to search engines on the pipeline's next turn. */
export async function approveContentAction(id: string): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const a = await db.article.findUnique({ where: { id } });
    if (!a) return failState("Article not found.");
    await db.article.update({ where: { id }, data: { status: "published", publishedAt: new Date(), reviewNote: null, indexedAt: null } });
    await audit({ actor: actorOf(admin), action: "content.approve", targetType: "article", targetId: id, summary: `Published “${a.title}” (was ${a.status})` });
    refresh(a.slug);
    return okState(undefined, "Published.");
  });
}

/** Publishes an article at a chosen time ("2026-10-09 14:30", UTC). */
export async function scheduleContentAction(id: string, when?: string): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const a = await db.article.findUnique({ where: { id } });
    if (!a) return failState("Article not found.");
    const m = (when ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) return failState("Enter the date and time as YYYY-MM-DD HH:MM (UTC).");
    const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() || at.getTime() > Date.now() + 90 * 86_400_000) return failState("Choose a time in the future, within the next 90 days.");
    await db.article.update({ where: { id }, data: { status: "published", publishedAt: at, reviewNote: null, indexedAt: null } });
    await audit({ actor: actorOf(admin), action: "content.schedule", targetType: "article", targetId: id, summary: `Scheduled “${a.title}” for ${at.toISOString()}` });
    refresh(a.slug);
    return okState(undefined, `Scheduled for ${at.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
  });
}

export async function unpublishContentAction(id: string): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const a = await db.article.findUnique({ where: { id } });
    if (!a) return failState("Article not found.");
    await db.article.update({ where: { id }, data: { status: "draft" } });
    await audit({ actor: actorOf(admin), action: "content.unpublish", targetType: "article", targetId: id, summary: `Unpublished “${a.title}”` });
    refresh(a.slug);
    return okState(undefined, "Unpublished: the article is a draft again.");
  });
}

/** Rejects an article. Its topic becomes available to the planner again. */
export async function rejectContentAction(id: string, reason?: string): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const a = await db.article.findUnique({ where: { id } });
    if (!a) return failState("Article not found.");
    await db.article.update({ where: { id }, data: { status: "rejected", reviewNote: `Rejected by ${admin.email}${reason?.trim() ? `: ${reason.trim()}` : ""}`.slice(0, 900) } });
    await db.seoCluster.updateMany({ where: { currentUrl: `/guides/${a.slug}` }, data: { urlExists: false, currentUrl: null } });
    await audit({ actor: actorOf(admin), action: "content.reject", targetType: "article", targetId: id, summary: `Rejected “${a.title}”${reason?.trim() ? `: ${reason.trim()}` : ""}` });
    refresh(a.slug);
    return okState(undefined, "Rejected.");
  });
}

/** Writes the article again from the same brief; the new text replaces this one and is checked like any other. */
export async function regenerateContentAction(id: string): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const a = await db.article.findUnique({ where: { id } });
    if (!a) return failState("Article not found.");
    const { requeueArticle } = await import("@/lib/content/engine");
    const taskId = await requeueArticle(id);
    if (!taskId) return failState("This article was not written by the pipeline, so there is no brief to write it from. Edit it by hand instead.");
    await db.article.update({ where: { id }, data: { status: a.status === "published" ? "published" : "pending_review", reviewNote: "A new version is being written. It will replace this text when it has passed the checks." } });
    await audit({ actor: actorOf(admin), action: "content.regenerate", targetType: "article", targetId: id, summary: `Regeneration queued for “${a.title}”` });
    refresh(a.slug);
    return okState(undefined, "Queued. The new version arrives with the next batch, usually within the hour.");
  });
}

export async function retryTaskAction(id: string): Promise<ActionState> {
  return runAdmin("content.manage", async () => {
    const t = await db.contentTask.findUnique({ where: { id } });
    if (!t) return failState("Task not found.");
    if (!["failed", "skipped"].includes(t.status)) return failState("Only failed or skipped topics can be tried again.");
    await db.contentTask.update({ where: { id }, data: { status: "planned", attempts: 0, error: null, batchId: null, checkBatchId: null, draftJson: null, verdictJson: null } });
    refresh();
    return okState(undefined, "Queued again.");
  });
}

/** Chooses today's topics now (normally the scheduled job does this once a day). */
export async function planContentAction(): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const { planDay } = await import("@/lib/content/plan");
    const plan = await planDay();
    await db.seoRun.create({ data: { kind: "content_plan", status: "ok", summary: plan.summary.slice(0, 400), detailJson: JSON.stringify(plan), finishedAt: new Date(), actorId: admin.id } }).catch(() => {});
    await audit({ actor: actorOf(admin), action: "content.plan", targetType: "content", targetId: plan.day, summary: plan.summary.slice(0, 300) });
    refresh();
    return okState(undefined, plan.summary);
  });
}

/** One turn of the pipeline now: send planned topics, collect finished batches, publish what is due. */
export async function runContentAction(): Promise<ActionState> {
  return runAdmin("content.manage", async () => {
    const { contentTick } = await import("@/lib/content/engine");
    try {
      const r = await contentTick(20_000);
      refresh();
      return okState(undefined, r.note || `Sent ${r.submitted} topic(s) to be written and ${r.checksSubmitted} draft(s) to be fact-checked; collected ${r.written} draft(s) and ${r.finished} finished article(s); announced ${r.published} published article(s).`);
    } catch (err) {
      return failState(err instanceof Error ? err.message : "The pipeline could not run.");
    }
  });
}

export async function saveContentSettingsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const int = (name: string, min: number, max: number, fallback: number) => {
      const n = Number.parseInt(String(formData.get(name) ?? ""), 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const on = (name: string) => formData.get(name) === "on";
    const patch = {
      "content.enabled": on("enabled"),
      "content.autoPublish": on("autoPublish"),
      "content.rampUp": on("rampUp"),
      "content.publishReportedNews": on("publishReportedNews"),
      "content.dailyTarget": int("dailyTarget", 0, 100, 100),
      "content.newsPerDay": int("newsPerDay", 0, 7, 6),
      "content.minScore": int("minScore", 30, 95, 45),
      "content.minQuality": int("minQuality", 50, 100, 75),
    };
    await saveSettings(patch, admin.id);
    await audit({ actor: actorOf(admin), action: "content.settings", targetType: "content", targetId: "settings", summary: `Content pipeline settings: ${JSON.stringify(patch)}` });
    refresh();
    return okState(undefined, "Saved.");
  });
}
