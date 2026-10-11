import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { ensureRecurringJobs, registerJobHandlers } from "@/lib/jobs/handlers";
import { noteDrain, processJobs } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";
// A drain starts jobs only in its first 25 s, but a started job (the weekly SEO analysis, an import
// batch) may need longer; 60 s cut them off and lost the rest of the drain with them.
export const maxDuration = 300;

/**
 * Cron entry point for hosts without a long-running process.
 *
 *   curl -X POST -H "Authorization: Bearer $JOBS_SECRET" https://site/api/jobs/run
 *
 * Vercel Cron calls it with GET and `Authorization: Bearer $CRON_SECRET`
 * (see vercel.json), so both verbs and both secrets are accepted.
 */
function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const secrets = [env.jobsSecret, env.cronSecret].filter(Boolean);
  return secrets.some((secret) => safeEqual(token, secret));
}

async function run(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  registerJobHandlers();
  await ensureRecurringJobs();
  const result = await processJobs(50);
  await noteDrain("cron", result);
  return Response.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
