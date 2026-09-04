import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { ensureRecurringJobs, registerJobHandlers } from "@/lib/jobs/handlers";
import { processJobs } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

/**
 * Cron entry point for hosts without a long-running process:
 *   curl -X POST -H "Authorization: Bearer $JOBS_SECRET" https://site/api/jobs/run
 */
export async function POST(req: Request) {
  const secret = env.jobsSecret;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secret || !token || !safeEqual(token, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  registerJobHandlers();
  await ensureRecurringJobs();
  const result = await processJobs(50);
  return Response.json({ ok: true, ...result });
}
