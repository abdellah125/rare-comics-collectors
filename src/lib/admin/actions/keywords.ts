"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { researchKeywords, type KeywordSummary } from "@/lib/seo/keyword-research";
import { SemrushError, semrushConfigured, unitBalance } from "@/lib/seo/semrush";
import { isSemrushDatabase, splitPhrases } from "@/lib/seo/semrush-csv";
import { failState, okState, type ActionState } from "@/lib/validation";

export type ConnectionTest = { balance: number; checkedAt: string };

/** The 0-unit balance call: proves the key works without spending anything. */
export async function testSemrushAction(): Promise<ActionState<ConnectionTest>> {
  return runAdmin("content.manage", async (admin) => {
    if (!semrushConfigured()) return failState("SEMRUSH_API_KEY is not set on the server. Add it to the deployment's environment variables and redeploy.");
    try {
      const balance = await unitBalance({ force: true, actorId: admin.id });
      await audit({ actor: actorOf(admin), action: "seo.semrush.test", targetType: "semrush", summary: `Semrush key verified, ${balance.toLocaleString("en-US")} units left` });
      revalidatePath("/admin/keywords");
      return okState({ balance, checkedAt: new Date().toISOString() }, `Semrush accepted the key. ${balance.toLocaleString("en-US")} API units remain (this check cost none).`);
    } catch (err) {
      return failState(err instanceof SemrushError ? err.message : "The connection test failed.");
    }
  });
}

export type ResearchOutcome = { results: KeywordSummary[]; fetched: number; cached: number; units: number; warnings: string[] };

export async function researchKeywordsAction(_prev: ActionState<ResearchOutcome> | undefined, formData: FormData): Promise<ActionState<ResearchOutcome>> {
  return runAdmin("content.manage", async (admin) => {
    const phrases = splitPhrases(String(formData.get("phrases") ?? ""), 50);
    if (phrases.length === 0) return failState("Enter at least one keyword (one per line).", { phrases: "Required" });
    const database = String(formData.get("database") ?? "us").trim().toLowerCase();
    if (!isSemrushDatabase(database)) return failState("Unknown Semrush database.", { database: "Choose one of the listed regions" });
    const related = formData.get("related") === "on";
    const questions = formData.get("questions") === "on";
    const limit = Math.min(50, Math.max(5, Number.parseInt(String(formData.get("limit") ?? "20"), 10) || 20));
    if (!semrushConfigured()) return failState("SEMRUSH_API_KEY is not set on the server.");
    const r = await researchKeywords({ phrases, database, related, questions, limit, actorId: admin.id });
    await audit({ actor: actorOf(admin), action: "seo.semrush.research", targetType: "semrush", summary: `Keyword research: ${phrases.length} phrase(s), ${database}, ${r.fetched} fetched, ${r.cached} from cache, ${r.units} units${related ? ", related" : ""}${questions ? ", questions" : ""}` });
    revalidatePath("/admin/keywords");
    const message = `${r.results.length} keyword(s): ${r.cached} from the cache, ${r.fetched} fetched, ${r.units.toLocaleString("en-US")} API units used.`;
    if (r.warnings.length && r.results.length === 0) return { ok: false, message: r.warnings[0], errors: {} };
    return okState({ results: r.results, fetched: r.fetched, cached: r.cached, units: r.units, warnings: r.warnings }, message);
  });
}
