"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { registerJobHandlers } from "@/lib/jobs/handlers";
import { cancelJob, enqueueJob, processJobs, registeredJobTypes, retryJob, type JobType } from "@/lib/jobs/queue";
import { reprocessWebhookEvent } from "@/lib/payments/webhooks";
import { failState, okState, type ActionState } from "@/lib/validation";

export async function retryJobAction(id: string): Promise<ActionState> {
  return runAdmin("system.manage", async (admin) => {
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
    const id = await enqueueJob(type as JobType, {}, { dedupe: true });
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
