"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { registerJobHandlers } from "@/lib/jobs/handlers";
import { cancelJob, enqueueJob, processJobs, recoverAbandonedJobs, registeredJobTypes, retryJob, type JobType } from "@/lib/jobs/queue";
import { reprocessWebhookEvent } from "@/lib/payments/webhooks";
import { failState, okState, type ActionState } from "@/lib/validation";

/** Retries a failed, cancelled or abandoned job, keeping its failure history. A live running job is refused. */
export async function retryJobAction(id: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    const before = await db.job.findUnique({ where: { id }, select: { type: true, status: true, attempts: true } });
    const r = await retryJob(id);
    if (!r.ok) return failState(r.message);
    await audit({ actor: actorOf(admin), action: "job.retry", targetType: "job", targetId: id, summary: `${before?.type ?? "Job"} (${before?.status}, ${before?.attempts} attempt(s)) re-queued` });
    revalidatePath("/admin/system");
    return okState(undefined, r.message);
  });
}

export async function cancelJobAction(id: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    const before = await db.job.findUnique({ where: { id }, select: { type: true, status: true } });
    const r = await cancelJob(id);
    if (!r.ok) return failState(r.message);
    await audit({ actor: actorOf(admin), action: "job.cancel", targetType: "job", targetId: id, summary: `${before?.type ?? "Job"} (${before?.status}) cancelled` });
    revalidatePath("/admin/system");
    return okState(undefined, r.message);
  });
}

/** Recovers running jobs whose worker stopped renewing the lease. Live jobs are not touched. */
export async function recoverAbandonedAction(): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    const n = await recoverAbandonedJobs(new Date(), { limit: 200 });
    if (n > 0) await audit({ actor: actorOf(admin), action: "job.recover", summary: `${n} abandoned job(s) recovered` });
    revalidatePath("/admin/system");
    return okState(undefined, n === 0 ? "No abandoned jobs: every running job is still reporting." : `${n} abandoned job${n === 1 ? "" : "s"} recovered: queued again with a delay, or marked failed when no attempts were left.`);
  });
}

export async function runJobsNowAction(): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
    registerJobHandlers();
    const r = await processJobs(50);
    const text = `${r.processed} succeeded, ${r.failed} failed (${r.retrying} will be retried)${r.recovered ? `, ${r.recovered} abandoned recovered` : ""}${r.remainingDue ? `; ${r.remainingDue} still due (stopped at the ${r.stoppedBy})` : ""}.`;
    await audit({ actor: actorOf(admin), action: "job.run_now", summary: `Manual job run: ${text}` });
    revalidatePath("/admin/system");
    return okState(undefined, text);
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
