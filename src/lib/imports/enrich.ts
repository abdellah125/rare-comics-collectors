import "server-only";
import { env } from "@/lib/env";

/**
 * Reference knowledge for details a listing does not state: which publisher released a comic and
 * in which year that issue came out. The question goes to the Anthropic API (server-side key);
 * nothing is scraped from any website.
 *
 * The answer is used only when the model marks it as certain. Uncertain or malformed answers are
 * dropped and the detail stays Unknown. Grades, prices, certification numbers and anything about
 * the individual copy are never asked for: those can only come from the listing itself.
 */
const MODEL = "claude-sonnet-5";
export const knowledgeConfigured = () => Boolean(env.anthropic.apiKey);

export type FactQuestion = { id: string; listingTitle: string; series: string; issue: string; needPublisher: boolean; needYear: boolean };
export type FactAnswer = { publisher?: string; year?: number };

const SYSTEM = [
  "You are a comic-book cataloguer with reference knowledge of American comic books.",
  "For each listing you are given its title as the seller wrote it, the series name and the issue number.",
  "Answer two bibliographic questions about that exact issue: its publisher, and the year on its cover date.",
  "Rules:",
  "- Answer only what you are certain of. If the series name is ambiguous (several volumes or publishers could match), or you are not sure, use null. A null is always better than a guess.",
  "- The year is the publication year of that specific issue, not the year the series started.",
  "- Use the publisher's usual full name, for example \"Marvel Comics\", \"DC Comics\", \"Image Comics\", \"Dark Horse Comics\", \"Dell\", \"Gold Key\".",
  "- Do not comment on grade, value or condition.",
  "Reply with a JSON array only, one object per listing, in the same order: [{\"id\": \"…\", \"publisher\": string|null, \"year\": number|null, \"certain\": boolean}]",
].join("\n");

export function parseFactAnswers(text: string, questions: FactQuestion[]): Map<string, FactAnswer> {
  const out = new Map<string, FactAnswer>();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return out;
  let rows: unknown;
  try {
    rows = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(rows)) return out;
  const asked = new Map(questions.map((q) => [q.id, q]));
  const thisYear = new Date().getFullYear();
  for (const r of rows as { id?: unknown; publisher?: unknown; year?: unknown; certain?: unknown }[]) {
    if (!r || typeof r.id !== "string" || r.certain !== true) continue;
    const q = asked.get(r.id);
    if (!q) continue;
    const answer: FactAnswer = {};
    if (q.needPublisher && typeof r.publisher === "string" && /^[\p{L}\d][\p{L}\d .,&'!-]{1,60}$/u.test(r.publisher.trim()) && !/^unknown$/i.test(r.publisher.trim())) answer.publisher = r.publisher.trim();
    if (q.needYear && typeof r.year === "number" && Number.isInteger(r.year) && r.year >= 1930 && r.year <= thisYear) answer.year = r.year;
    if (answer.publisher || answer.year) out.set(r.id, answer);
  }
  return out;
}

export async function lookupComicFacts(questions: FactQuestion[]): Promise<Map<string, FactAnswer>> {
  if (!knowledgeConfigured() || questions.length === 0) return new Map();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.anthropic.apiKey, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2500,
        thinking: { type: "disabled" },
        system: SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(questions.map((q) => ({ id: q.id, listing: q.listingTitle.slice(0, 200), series: q.series.slice(0, 120), issue: q.issue, want: [q.needPublisher ? "publisher" : "", q.needYear ? "year" : ""].filter(Boolean) }))) }],
      }),
    });
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    return parseFactAnswers(text, questions);
  } catch (err) {
    // The lookup is an extra: when it is unavailable the details simply stay Unknown.
    console.error("[import knowledge]", err instanceof Error ? err.message : err);
    return new Map();
  }
}
