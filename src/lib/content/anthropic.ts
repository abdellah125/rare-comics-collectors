import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Server-side client for the Anthropic API, as the content pipeline uses it: single messages
 * and message batches (a day's articles go out as one batch and come back within the hour,
 * which keeps every server request short and costs half as much). The key is read from the
 * environment here and nowhere else; it is never logged and never sent to a browser.
 */
export const WRITER_MODEL = process.env.CONTENT_MODEL || "claude-sonnet-5-5";
export const CHECKER_MODEL = process.env.CONTENT_CHECK_MODEL || "claude-opus-5-5";
export const contentAiConfigured = () => Boolean(env.anthropic.apiKey);

const API = "https://api.anthropic.com/v1";
const headers = () => ({ "content-type": "application/json", "x-api-key": env.anthropic.apiKey, "anthropic-version": "2023-06-01" });
const scrub = (s: string) => s.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***");

export class AiError extends Error {}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}): Promise<{ status: number; json: T }> {
  if (!contentAiConfigured()) throw new AiError("ANTHROPIC_API_KEY is not set on the server.");
  let res: Response;
  try {
    res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { method: init.method ?? (init.body === undefined ? "GET" : "POST"), headers: headers(), body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(init.timeoutMs ?? 25_000), cache: "no-store" });
  } catch (err) {
    throw new AiError(`The AI service could not be reached (${err instanceof Error ? err.name : "error"}).`);
  }
  const json = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, json };
}

export type Block = { type: string; text?: string; citations?: { url?: string; title?: string; cited_text?: string }[]; content?: unknown };
export type Usage = { input_tokens?: number; output_tokens?: number; server_tool_use?: { web_search_requests?: number } };
export type MessageResult = { text: string; blocks: Block[]; usage: Usage; stop: string };
type ApiMessage = { content?: Block[]; usage?: Usage; stop_reason?: string; error?: { message?: string } };

export type MessageParams = { model: string; max_tokens: number; system: string; messages: { role: "user"; content: string }[]; tools?: unknown[]; thinking?: unknown };

/**
 * How to switch a model's thinking off (it would otherwise spend the output budget). The
 * accepted spelling differs between models, so it is found once per model with a tiny request.
 */
const thinkingMode = new Map<string, { thinking?: unknown; extraTokens: number }>();
export async function thinkingFor(model: string): Promise<{ thinking?: unknown; extraTokens: number }> {
  const known = thinkingMode.get(model);
  if (known) return known;
  for (const option of [{ type: "disabled" }, { type: "between_tools" }, undefined]) {
    const { status, json } = await call<ApiMessage>("/messages", { body: { model, max_tokens: 16, ...(option ? { thinking: option } : {}), messages: [{ role: "user", content: "Reply with: ok" }] } });
    if (status === 200) {
      // When thinking cannot be turned off, leave room for it.
      const mode = { thinking: option, extraTokens: option ? 0 : 4000 };
      thinkingMode.set(model, mode);
      return mode;
    }
    if (!(status === 400 && /thinking/i.test(json.error?.message ?? ""))) throw new AiError(scrub(json.error?.message ?? `The AI service answered ${status}.`));
  }
  throw new AiError(`Model ${model} did not accept any thinking setting.`);
}

/** Request parameters with the model's thinking setting applied. */
export async function withThinking(p: MessageParams): Promise<MessageParams> {
  const mode = await thinkingFor(p.model);
  return { ...p, max_tokens: p.max_tokens + mode.extraTokens, ...(mode.thinking ? { thinking: mode.thinking } : {}) };
}

const read = (m: ApiMessage): MessageResult => ({ text: (m.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""), blocks: m.content ?? [], usage: m.usage ?? {}, stop: m.stop_reason ?? "" });

/** One request, answered directly. Used for single regenerations and for tests; the daily run uses batches. */
export async function message(p: MessageParams, timeoutMs = 280_000): Promise<MessageResult> {
  const { status, json } = await call<ApiMessage>("/messages", { body: await withThinking(p), timeoutMs });
  if (status !== 200) throw new AiError(scrub(json.error?.message ?? `The AI service answered ${status}.`));
  return read(json);
}

export async function createBatch(requests: { custom_id: string; params: MessageParams }[]): Promise<string> {
  const prepared = [];
  for (const r of requests) prepared.push({ custom_id: r.custom_id, params: await withThinking(r.params) });
  const { status, json } = await call<{ id?: string; error?: { message?: string } }>("/messages/batches", { body: { requests: prepared }, timeoutMs: 50_000 });
  if (status !== 200 || !json.id) throw new AiError(scrub(json.error?.message ?? `The AI service answered ${status}.`));
  return json.id;
}

export type BatchState = { ended: boolean; counts: { processing: number; succeeded: number; errored: number; canceled: number; expired: number }; resultsUrl: string | null };
export async function getBatch(id: string): Promise<BatchState> {
  const { status, json } = await call<{ processing_status?: string; request_counts?: BatchState["counts"]; results_url?: string | null; error?: { message?: string } }>(`/messages/batches/${id}`);
  if (status !== 200) throw new AiError(scrub(json.error?.message ?? `The AI service answered ${status}.`));
  return { ended: json.processing_status === "ended", counts: json.request_counts ?? { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 }, resultsUrl: json.results_url ?? null };
}

export type BatchResult = { ok: true; result: MessageResult } | { ok: false; error: string };
/** The results of a finished batch, by the id each request was given. */
export async function batchResults(resultsUrl: string): Promise<Map<string, BatchResult>> {
  let res: Response;
  try {
    res = await fetch(resultsUrl, { headers: headers(), signal: AbortSignal.timeout(40_000), cache: "no-store" });
  } catch (err) {
    throw new AiError(`The batch results could not be downloaded (${err instanceof Error ? err.name : "error"}).`);
  }
  if (!res.ok) throw new AiError(`The batch results answered ${res.status}.`);
  const out = new Map<string, BatchResult>();
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { custom_id: string; result?: { type?: string; message?: ApiMessage; error?: { error?: { message?: string }; message?: string } } };
      if (row.result?.type === "succeeded" && row.result.message) out.set(row.custom_id, { ok: true, result: read(row.result.message) });
      else out.set(row.custom_id, { ok: false, error: scrub(row.result?.error?.error?.message ?? row.result?.error?.message ?? row.result?.type ?? "no result") });
    } catch {
      // a malformed line is skipped; its task stays open and is retried
    }
  }
  return out;
}

/** Addresses the web search returned and the passages the model cited from them. */
export function searchEvidence(blocks: Block[]): { urls: string[]; cited: { url: string; title: string; text: string }[] } {
  const urls = new Set<string>();
  const cited: { url: string; title: string; text: string }[] = [];
  for (const b of blocks) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content as { url?: string }[]) if (typeof r?.url === "string") urls.add(r.url);
    for (const c of b.citations ?? []) if (c.url) cited.push({ url: c.url, title: c.title ?? "", text: (c.cited_text ?? "").slice(0, 600) });
  }
  return { urls: [...urls], cited };
}

/** Records what a request cost, for the usage screen. Never throws. */
export async function logAiUsage(endpoint: string, params: string, usage: Usage, status: "ok" | "error" = "ok", error?: string) {
  await db.apiUsage.create({ data: { provider: "anthropic", endpoint, params: params.slice(0, 200), lines: usage.server_tool_use?.web_search_requests ?? 0, units: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0), status, error: error?.slice(0, 300) } }).catch(() => {});
}
