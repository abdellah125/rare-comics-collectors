"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { writeAnalysis } from "@/lib/seo/ai";
import { connectionStatus, stepAnalyse, stepCandidates, stepCompetitorGap, stepMetrics, stepOwnRankings, stepResearch, stepSearchConsole, stepSerps, type StepResult } from "@/lib/seo/pipeline";
import { startAudit } from "@/lib/seo/site-audit";
import { failState, okState, type ActionState } from "@/lib/validation";

const STATUSES = ["discovered", "analyzed", "targeting", "content_needed", "optimizing", "published", "ranking", "needs_improvement"];
export type SeoStep = "test" | "candidates" | "search_console" | "analyse" | "research" | "metrics" | "serp" | "gap" | "own_rankings" | "audit" | "ai";

/** Runs one pipeline step. Paid steps are guarded again inside the client (balance and reserve). */
export async function runSeoStepAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const step = String(formData.get("step") ?? "") as SeoStep;
    let result: StepResult | { ok: boolean; summary: string; credits?: number };
    switch (step) {
      case "test": {
        const s = await connectionStatus();
        result = { ok: s.ok, summary: s.ok ? `${s.message} ${s.credits === null ? "" : `${s.credits.toLocaleString("en-US")} credits remaining.`} This check is free.` : s.message };
        break;
      }
      case "candidates": result = await stepCandidates(admin.id); break;
      case "search_console": result = await stepSearchConsole(admin.id); break;
      case "analyse": result = await stepAnalyse(admin.id); break;
      case "research": result = await stepResearch(String(formData.get("seeds") ?? "").split(/[\n,]+/), admin.id); break;
      case "metrics": result = await stepMetrics(Number.parseInt(String(formData.get("limit") ?? "200"), 10) || 200, admin.id); break;
      case "serp": result = await stepSerps(Number.parseInt(String(formData.get("count") ?? "5"), 10) || 5, admin.id); break;
      case "gap": result = await stepCompetitorGap(String(formData.get("domain") ?? ""), admin.id); break;
      case "own_rankings": result = await stepOwnRankings(admin.id); break;
      case "audit": {
        const n = await startAudit(admin.id);
        result = { ok: true, summary: `Site audit started: ${n} pages are being crawled in the background. Reload the Site audit tab in a few minutes. No credits used.` };
        break;
      }
      case "ai": result = await writeAnalysis(admin.id); break;
      default: return failState("Unknown step.");
    }
    await audit({ actor: actorOf(admin), action: `seo.${step}`, targetType: "seo", summary: `SEO ${step}: ${result.summary.slice(0, 200)}` });
    revalidatePath("/admin/seo");
    return result.ok ? okState(undefined, result.summary) : failState(result.summary);
  });
}

/** Sets a keyword's status by hand ("auto" hands it back to the system). */
export async function setKeywordStatusAction(formData: FormData): Promise<void> {
  await runAdmin("content.manage", async () => {
    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "");
    if (status === "auto") await db.seoKeyword.update({ where: { id }, data: { statusManual: false } });
    else if (STATUSES.includes(status)) await db.seoKeyword.update({ where: { id }, data: { status, statusManual: true } });
    revalidatePath("/admin/seo");
    return okState();
  });
}

export async function setClusterStatusAction(formData: FormData): Promise<void> {
  await runAdmin("content.manage", async () => {
    const key = String(formData.get("key") ?? "");
    const status = String(formData.get("status") ?? "");
    if (status === "auto") {
      await db.seoCluster.update({ where: { key }, data: { statusManual: false } });
      await db.seoKeyword.updateMany({ where: { clusterKey: key }, data: { statusManual: false } });
    }
    else if (STATUSES.includes(status)) {
      await db.seoCluster.update({ where: { key }, data: { status, statusManual: true } });
      // The cluster's keywords follow the page they belong to.
      await db.seoKeyword.updateMany({ where: { clusterKey: key }, data: { status, statusManual: true } });
    }
    revalidatePath("/admin/seo");
    return okState();
  });
}
