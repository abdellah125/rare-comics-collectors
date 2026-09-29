import { can, getCurrentUser } from "@/lib/auth/session";
import { cachedKeywords } from "@/lib/seo/keyword-research";
import { isSemrushDatabase } from "@/lib/seo/semrush-csv";

export const dynamic = "force-dynamic";

const cell = (v: string | number | null) => { const s = v === null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV of everything cached for a region — from our database, never a live Semrush call. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "content.manage")) return new Response("Forbidden", { status: 403 });
  const database = new URL(req.url).searchParams.get("database") ?? "us";
  if (!isSemrushDatabase(database)) return new Response("Unknown database", { status: 400 });
  const rows = await cachedKeywords(database, 5000);
  const lines = [
    ["keyword", "database", "volume", "keyword_difficulty", "cpc_usd", "competition", "results", "intents", "related", "questions", "fetched_at"],
    ...rows.map((k) => [k.phrase, k.database, k.volume, k.difficulty, k.cpc, k.competition, k.results, k.intents, k.related.map((r) => `${r.phrase} (${r.volume ?? "?"})`).join(" | "), k.questions.map((r) => `${r.phrase} (${r.volume ?? "?"})`).join(" | "), k.fetchedAt.toISOString()]),
  ];
  const csv = lines.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="keywords-${database}.csv"`, "cache-control": "no-store" } });
}
