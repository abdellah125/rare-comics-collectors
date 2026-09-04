import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { ensureRecurringJobs, registerJobHandlers } from "@/lib/jobs/handlers";
import { processJobs } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";
// Draining 50 jobs (emails, payouts, cleanups) can take a while on a cold function.
export const maxDuration = 60;

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
  return Response.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
