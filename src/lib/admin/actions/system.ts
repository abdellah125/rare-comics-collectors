"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { registerJobHandlers } from "@/lib/jobs/handlers";
import { STALE_LOCK_MS, cancelJob, enqueueJob, processJobs, registeredJobTypes, retryJob, type JobType } from "@/lib/jobs/queue";
import { reprocessWebhookEvent } from "@/lib/payments/webhooks";
import { failState, okState, type ActionState } from "@/lib/validation";

export async function retryJobAction(id: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    const job = await db.job.findUnique({ where: { id }, select: { status: true, lockedAt: true } });
    if (!job) return failState("Job not found.");
    // A running job is only released when its lock is stale (its function was cut off); a live one is left alone.
    if (job.status === "running" && job.lockedAt && job.lockedAt.getTime() > Date.now() - STALE_LOCK_MS) return failState("This job is running right now. Try again in a few minutes if it does not finish.");
    await retryJob(id);
    await audit({ actor: actorOf(admin), action: "job.retry", targetType: "job", targetId: id, summary: "Job re-queued" });
    revalidatePath("/admin/system");
    return okState(undefined, "Job re-queued.");
  });
}

export async function cancelJobAction(id: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    await cancelJob(id);
    await audit({ actor: actorOf(admin), action: "job.cancel", targetType: "job", targetId: id, summary: "Job cancelled" });
    revalidatePath("/admin/system");
    return okState(undefined, "Job cancelled.");
  });
}

export async function runJobsNowAction(): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    registerJobHandlers();
    const r = await processJobs(50);
    await audit({ actor: actorOf(admin), action: "job.run_now", summary: `Manual job run: ${r.processed} processed, ${r.failed} failed` });
    revalidatePath("/admin/system");
    return okState(undefined, `${r.processed} job${r.processed === 1 ? "" : "s"} processed, ${r.failed} failed.`);
  });
}

export async function enqueueJobAction(type: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    registerJobHandlers();
    if (!registeredJobTypes().includes(type as JobType)) return failState("Unknown job type.");
    const id = await enqueueJob(type as JobType, {}, { dedupe: true, runAt: new Date() });
    await audit({ actor: actorOf(admin), action: "job.enqueue", targetType: "job", targetId: id, summary: `${type} queued manually` });
    revalidatePath("/admin/system");
    return okState(undefined, `${type} queued.`);
  });
}

/** Removes failed jobs that no longer matter: a later run of the same type has completed since. */
export async function clearResolvedFailuresAction(): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    const failed = await db.job.findMany({ where: { status: "failed" }, select: { id: true, type: true, runAt: true } });
    const lastOk = new Map((await db.job.groupBy({ by: ["type"], where: { status: "completed" }, _max: { completedAt: true } })).map((r) => [r.type, r._max.completedAt]));
    const resolved = failed.filter((f) => {
      const ok = lastOk.get(f.type);
      return ok && ok > f.runAt;
    });
    if (resolved.length === 0) return okState(undefined, "Nothing to clear: every failure is still the latest result for its job type.");
    await db.job.deleteMany({ where: { id: { in: resolved.map((r) => r.id) } } });
    await audit({ actor: actorOf(admin), action: "job.clear_failed", summary: `${resolved.length} resolved failure(s) cleared` });
    revalidatePath("/admin/system");
    return okState(undefined, `${resolved.length} failure${resolved.length === 1 ? "" : "s"} cleared: a later run of the same job has succeeded since.`);
  });
}

export async function reprocessWebhookAction(id: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    const ev = await db.webhookEvent.findUnique({ where: { id }, select: { id: true, provider: true, type: true } });
    if (!ev) return failState("Event not found.");
    try {
      await reprocessWebhookEvent(id);
    } catch (err) {
      return failState(`Reprocess failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await audit({ actor: actorOf(admin), action: "webhook.reprocess", targetType: "webhook", targetId: id, summary: `${ev.provider} ${ev.type} reprocessed` });
    revalidatePath("/admin/system/webhooks");
    return okState(undefined, "Webhook reprocessed.");
  });
}
