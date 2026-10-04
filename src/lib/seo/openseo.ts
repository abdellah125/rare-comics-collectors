import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getSettings, saveSettings } from "@/lib/settings";

/**
 * OpenSEO client. OpenSEO has no REST API: it exposes its tools over the Model Context
 * Protocol at https://app.openseo.so/mcp (JSON-RPC 2.0 over streamable HTTP), authenticated
 * with `Authorization: Bearer oseo_…`. The key is read from OPENSEO_API_KEY here and nowhere
 * else; it is only ever placed in that request header, and nothing that is logged or stored
 * (ApiUsage rows, SeoRun summaries, errors) contains it.
 *
 * Tools used (verified against tools/list on 2026-10-03):
 *   free:  whoami, list_projects, get_search_console_performance
 *   paid:  research_keywords (~54 credits/seed at 150 rows), get_keyword_metrics (≤700 phrases),
 *          get_serp_results (~5/keyword at depth 20), get_ranked_keywords (~24 per 100 rows),
 *          get_domain_overview (~100–300)
 * Search volume, difficulty, intent and SERP data come from DataForSEO through OpenSEO.
 *
 * Every paid call is guarded: the balance is read first (free), the call is refused when it
 * would dip into the reserve ("seo.openseoReserveCredits"), and the real cost is measured as
 * the balance difference afterwards and written to ApiUsage.
 */

export class OpenSeoError extends Error {
  constructor(message: string, public code: "not_configured" | "auth" | "budget" | "rate_limit" | "tool" | "network") {
    super(message);
    this.name = "OpenSeoError";
  }
}

const ENDPOINT = "https://app.openseo.so/mcp";
const TIMEOUT_MS = 55_000;
const SESSION_TTL_MS = 10 * 60_000;

/** Typical cost per call in credits, used for the pre-flight check; the real cost is measured. */
export const COST = {
  research_keywords: (seeds: number, limit: number) => seeds * (limit >= 500 ? 205 : limit >= 300 ? 150 : 95),
  get_keyword_metrics: (phrases: number) => 12 + Math.ceil(phrases * 0.15),
  get_serp_results: (queries: number, depth: number) => Math.ceil(queries * (5 + Math.max(0, depth - 20) * 0.25)),
  get_ranked_keywords: () => 30,
  find_serp_competitors: () => 30,
  get_domain_overview: () => 300,
} as const;

let session: { id: string | null; at: number } | null = null;
let rpcId = 0;
let chain: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const openSeoConfigured = () => env.openseo.configured;
const redact = (s: string) => s.replace(/oseo_[A-Za-z0-9]+/g, "oseo_***");

type RpcResult = { result?: Record<string, unknown>; error?: { code: number; message: string } };

async function post(body: Record<string, unknown>, expectReply: boolean): Promise<RpcResult | null> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${env.openseo.apiKey}` };
  if (session?.id) headers["mcp-session-id"] = session.id;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    } catch (err) {
      if (attempt < 3) {
        await sleep(1500 * attempt);
        continue;
      }
      throw new OpenSeoError(`Could not reach OpenSEO: ${redact(err instanceof Error ? err.message : String(err))}`, "network");
    }
    if (res.status === 401 || res.status === 403) throw new OpenSeoError("OpenSEO rejected the API key (check OPENSEO_API_KEY).", "auth");
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      if (attempt < 4) {
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 2000 * 2 ** (attempt - 1));
        continue;
      }
      throw new OpenSeoError(res.status === 429 ? "OpenSEO rate limit reached; try again in a minute." : `OpenSEO answered HTTP ${res.status}.`, res.status === 429 ? "rate_limit" : "network");
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) session = { id: sid, at: Date.now() };
    if (!expectReply) return null;
    const text = await res.text();
    // Streamable HTTP may answer as JSON or as one server-sent event carrying the JSON.
    const payload = /^\s*\{/.test(text) ? text : (text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? "");
    try {
      return JSON.parse(payload) as RpcResult;
    } catch {
      throw new OpenSeoError(`OpenSEO sent an unreadable answer (HTTP ${res.status}).`, "network");
    }
  }
}

async function ensureSession() {
  if (session && Date.now() - session.at < SESSION_TTL_MS) return;
  session = { id: null, at: Date.now() };
  const init = await post({ jsonrpc: "2.0", id: ++rpcId, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rare-comics-collectors", version: "1.0" } } }, true);
  if (init?.error) throw new OpenSeoError(`OpenSEO handshake failed: ${init.error.message}`, "network");
  await post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, false);
}

/** One raw tool call. Calls are serialised: OpenSEO work is bursty and a queue avoids rate limits. */
function rawTool<T>(name: string, args: Record<string, unknown>): Promise<{ data: T; text: string }> {
  const run = chain.then(async () => {
    await ensureSession();
    let reply = await post({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }, true);
    if (reply?.error && /session/i.test(reply.error.message)) {
      session = null;
      await ensureSession();
      reply = await post({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }, true);
    }
    if (reply?.error) throw new OpenSeoError(`OpenSEO ${name}: ${redact(reply.error.message)}`, "tool");
    const result = (reply?.result ?? {}) as { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
    const text = (result.content ?? []).map((c) => c.text ?? "").join("\n");
    if (result.isError) throw new OpenSeoError(`OpenSEO ${name}: ${redact(text).slice(0, 300)}`, /credit|plan|upgrade|balance/i.test(text) ? "budget" : "tool");
    return { data: (result.structuredContent ?? {}) as T, text };
  });
  chain = run.catch(() => undefined);
  return run;
}

async function logUsage(e: { tool: string; summary: string; lines?: number; credits?: number; status: string; error?: string | null; durationMs?: number; actorId?: string | null }) {
  await db.apiUsage.create({ data: { provider: "openseo", endpoint: e.tool, params: redact(e.summary).slice(0, 500), lines: e.lines ?? 0, units: e.credits ?? 0, status: e.status, error: e.error ? redact(e.error).slice(0, 500) : null, durationMs: e.durationMs ?? null, actorId: e.actorId ?? null } }).catch(() => undefined);
}

export type Account = { email: string; mode: string; credits: number | null };

/** Free. The authentication test, and the balance every paid call is checked against. */
export async function whoami(): Promise<Account> {
  if (!env.openseo.configured) throw new OpenSeoError("OPENSEO_API_KEY is not set on the server.", "not_configured");
  const { data, text } = await rawTool<{ userEmail?: string; mode?: string; creditsRemaining?: number | null }>("whoami", {});
  const fromText = text.match(/Credits remaining:\s*([\d,]+)/i);
  return { email: data.userEmail ?? "", mode: data.mode ?? "hosted", credits: typeof data.creditsRemaining === "number" ? data.creditsRemaining : fromText ? Number(fromText[1].replace(/,/g, "")) : null };
}

/** The OpenSEO project every call is scoped to: the saved one, else the project for this domain, else the first. */
export async function projectId(): Promise<string> {
  const settings = await getSettings();
  if (settings["seo.openseoProjectId"]) return settings["seo.openseoProjectId"];
  const { data } = await rawTool<{ projects?: { id: string; name: string; domain?: string | null }[] }>("list_projects", {});
  const projects = data.projects ?? [];
  const host = new URL(env.siteUrl).hostname.replace(/^www\./, "");
  const chosen = projects.find((p) => (p.domain ?? "").replace(/^www\./, "") === host) ?? projects[0];
  if (!chosen) throw new OpenSeoError("The OpenSEO account has no project. Create one at app.openseo.so.", "tool");
  await saveSettings({ "seo.openseoProjectId": chosen.id });
  return chosen.id;
}

export type ToolResult<T> = { data: T; text: string; credits: number; balance: number | null };

/**
 * A tool call with accounting. `estimate` > 0 marks it as paid: the balance must cover the
 * estimate plus the reserve, and the measured cost is logged. Free calls skip the balance reads.
 */
export async function callTool<T>(name: string, args: Record<string, unknown>, opts: { estimate?: number; summary: string; lines?: (data: T) => number; actorId?: string | null }): Promise<ToolResult<T>> {
  if (!env.openseo.configured) throw new OpenSeoError("OPENSEO_API_KEY is not set on the server.", "not_configured");
  const estimate = opts.estimate ?? 0;
  const started = Date.now();
  let before: number | null = null;
  if (estimate > 0) {
    const settings = await getSettings();
    before = (await whoami()).credits;
    const reserve = settings["seo.openseoReserveCredits"];
    if (before !== null && before - estimate < reserve) {
      const message = `Not run: ${before.toLocaleString("en-US")} credits left, this step needs about ${estimate} and ${reserve} are kept in reserve.`;
      await logUsage({ tool: name, summary: opts.summary, status: "blocked", error: message, actorId: opts.actorId });
      throw new OpenSeoError(message, "budget");
    }
  }
  try {
    const withProject = name === "whoami" || name === "list_projects" ? args : { projectId: await projectId(), ...args };
    const { data, text } = await rawTool<T>(name, withProject);
    let credits = 0;
    let balance = before;
    if (estimate > 0) {
      balance = (await whoami().catch(() => ({ credits: null as number | null }))).credits;
      if (before !== null && balance !== null) credits = Math.max(0, before - balance);
    }
    await logUsage({ tool: name, summary: opts.summary, lines: opts.lines?.(data) ?? 0, credits, status: "ok", durationMs: Date.now() - started, actorId: opts.actorId });
    return { data, text, credits, balance };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logUsage({ tool: name, summary: opts.summary, status: "error", error: message, durationMs: Date.now() - started, actorId: opts.actorId });
    throw err instanceof OpenSeoError ? err : new OpenSeoError(redact(message), "network");
  }
}
