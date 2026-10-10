import "server-only";
import { db } from "@/lib/db";
import { indexNowJobOutcome, pathsOf, submitIndexNow } from "@/lib/indexnow";
import { INDEXNOW_MAX_URLS } from "@/lib/indexnow-payload";
import { PermanentJobError } from "@/lib/jobs/policy";
import type { JobContext } from "@/lib/jobs/queue";

/**
 * The indexnow_ping job. Other waiting pings (queued before pings were batched, or a sealed full
 * batch) go out in the same request, up to the protocol's 10,000 URLs; they are marked completed
 * only once that request has been accepted, and only if nothing was added to them meanwhile.
 * A refused request throws (see indexNowJobOutcome) and leaves them waiting.
 */
export async function runIndexNowPing(payload: Record<string, unknown>, ctx: Pick<JobContext, "jobId">): Promise<string> {
  if (!Array.isArray(payload.paths)) throw new PermanentJobError("indexnow_ping payload has no paths list.");
  const paths = new Set(payload.paths.filter((p): p is string => typeof p === "string"));
  const others = await db.job.findMany({ where: { type: "indexnow_ping", status: "pending", id: { not: ctx.jobId } }, orderBy: { createdAt: "asc" }, take: 500, select: { id: true, payloadJson: true } });
  const absorbed: typeof others = [];
  for (const o of others) {
    const more = pathsOf(o.payloadJson);
    if (new Set([...paths, ...more]).size > INDEXNOW_MAX_URLS) break;
    more.forEach((p) => paths.add(p));
    absorbed.push(o);
  }
  const summary = indexNowJobOutcome(await submitIndexNow([...paths]));
  const now = new Date();
  let merged = 0;
  for (const o of absorbed) {
    const r = await db.job.updateMany({ where: { id: o.id, status: "pending", payloadJson: o.payloadJson }, data: { status: "completed", completedAt: now, dedupeKey: null, result: `Handled together with job ${ctx.jobId}: ${summary}` } });
    merged += r.count;
  }
  return merged ? `${summary} (together with ${merged} other waiting ping job(s))` : summary;
}
