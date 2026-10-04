import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Written analysis of the stored data: "which keywords should this site target next, and why".
 * The model is given only the figures already in the database (it calls no SEO API and is told
 * not to add numbers of its own); its answer is stored as a SeoRun of kind "ai" and shown on
 * the roadmap. Optional: without ANTHROPIC_API_KEY the roadmap still carries the rule-based
 * reason for every recommendation.
 */

const MODEL = "claude-sonnet-5";
export const aiConfigured = () => Boolean(env.anthropic.apiKey);

export async function writeAnalysis(actorId?: string | null): Promise<{ ok: boolean; summary: string }> {
  if (!aiConfigured()) return { ok: false, summary: "ANTHROPIC_API_KEY is not set on the server, so the written analysis is unavailable. The roadmap's own reasons are computed without it." };
  const [clusters, insights, counts] = await Promise.all([
    db.seoCluster.findMany({ where: { score: { not: null }, priority: { in: ["high", "medium", "long_term"] } }, orderBy: [{ score: "desc" }], take: 40, select: { label: true, primaryPhrase: true, secondaryJson: true, intent: true, volume: true, totalVolume: true, difficulty: true, score: true, priority: true, priorityWhy: true, pageType: true, recommendedUrl: true, urlExists: true, bestPosition: true, currentUrl: true } }),
    db.seoInsight.findMany({ orderBy: { weight: "desc" }, take: 30, select: { type: true, title: true, detail: true } }),
    db.seoKeyword.groupBy({ by: ["priority"], _count: { _all: true } }),
  ]);
  if (clusters.length === 0) return { ok: false, summary: "There is no scored keyword yet. Run the Search Console sync and fetch metrics first." };
  const data = { site: new URL(env.siteUrl).hostname, business: "Online shop selling rare, vintage and CGC/CBCS graded comic books; also appraisal, grading submission and consignment services. A young site with little authority.", keywordCounts: counts.map((c) => ({ priority: c.priority, keywords: c._count._all })), clusters: clusters.map((c) => ({ ...c, secondary: JSON.parse(c.secondaryJson) as string[], secondaryJson: undefined })), detectedOpportunities: insights };

  const run = await db.seoRun.create({ data: { kind: "ai", actorId: actorId ?? null } });
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.anthropic.apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        model: MODEL,
        // Thinking is on by default for this model and its tokens count against max_tokens: with a large
        // data payload it used the whole budget and returned no text. The task is a summary of figures
        // already computed, so it runs without thinking and with room to finish.
        max_tokens: 2500,
        thinking: { type: "disabled" },
        system: "You are an SEO strategist for a small online comic-book shop. Answer the question: which keywords should this website target next to maximise realistic organic traffic and qualified sales? Use ONLY the data in the user's message: every figure you cite (volume, difficulty, position, score) must appear there, and you must never invent a number, a competitor, or a fact about a comic. Prefer relevant keywords with buyer intent that the site can realistically rank for over high-volume ones; say so when you skip a high-volume keyword and why. Prefer improving a page that exists over creating a new one. Output plain text: a two-sentence summary, then 'Do first' (up to 6 items), 'Do next' (up to 5), 'Not yet' (up to 4). Each item: the keyword or cluster, the page to work on, the action, and the data behind it in parentheses. No markdown tables, no headings other than those three labels.",
        messages: [{ role: "user", content: JSON.stringify(data) }],
      }),
    });
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    let text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
    if (!text) throw new Error(`The model returned no text (stop reason: ${json.stop_reason ?? "unknown"}).`);
    if (json.stop_reason === "max_tokens") text += "\n\n[The analysis was cut off at the length limit.]";
    await db.seoRun.update({ where: { id: run.id }, data: { status: "ok", summary: "Written analysis updated.", detailJson: JSON.stringify({ text, model: MODEL, clusters: clusters.length }), finishedAt: new Date() } });
    return { ok: true, summary: "Written analysis updated from the stored data." };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***");
    await db.seoRun.update({ where: { id: run.id }, data: { status: "error", summary: message.slice(0, 400), finishedAt: new Date() } });
    return { ok: false, summary: `The written analysis failed: ${message}` };
  }
}
