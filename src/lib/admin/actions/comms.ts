"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audienceCount } from "@/lib/admin/audience";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/domain";
import { enqueueJob } from "@/lib/jobs/queue";
import { deliverEmail, queueRawEmail, renderTemplate } from "@/lib/mail";
import { failState, fieldErrors, formToObject, okState, zBool, zDateOptional, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const BASE_VARS = ["siteName", "siteUrl", "supportEmail", "name"];

/* --------------------------------------------------------- templates */

const TemplateSchema = z.object({ key: zTrimmed(60).min(1), subject: zTrimmed(200).min(1), bodyText: zTrimmed(20_000).min(1), isEnabled: zBool.optional() });

export async function saveTemplateAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("notifications.manage", async (admin) => {
    const parsed = TemplateSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const t = await db.emailTemplate.findUnique({ where: { key: d.key } });
    if (!t) return failState("Template not found.");
    const allowed = new Set([...BASE_VARS, ...(JSON.parse(t.variablesJson) as string[])]);
    const used = [...`${d.subject}\n${d.bodyText}`.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
    const unknown = [...new Set(used.filter((v) => !allowed.has(v)))];
    if (unknown.length > 0) return failState(`Unknown variable${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Allowed: ${[...allowed].join(", ")}.`);
    await db.emailTemplate.update({ where: { key: d.key }, data: { subject: d.subject, bodyText: d.bodyText, isEnabled: d.isEnabled ?? true } });
    await audit({ actor: actorOf(admin), action: "email_template.update", targetType: "email_template", targetId: d.key, summary: `Template ${d.key} updated`, before: { subject: t.subject, enabled: t.isEnabled }, after: { subject: d.subject, enabled: d.isEnabled ?? true } });
    revalidatePath("/admin/notifications");
    return okState(undefined, "Template saved.");
  });
}

/** Sends a rendered sample of the template to the signed-in admin only. */
export async function sendTestEmailAction(key: string): Promise<ActionState> {
  return runAdmin("notifications.manage", async (admin) => {
    const t = await db.emailTemplate.findUnique({ where: { key } });
    if (!t) return failState("Template not found.");
    const vars: Record<string, string> = { siteName: "Rare Comics Collectors", siteUrl: "https://example.test", supportEmail: "support@example.test", name: admin.name };
    for (const v of JSON.parse(t.variablesJson) as string[]) if (!(v in vars)) vars[v] = `[${v}]`;
    await queueRawEmail({ to: admin.email, subject: `[TEST] ${renderTemplate(t.subject, vars)}`, body: renderTemplate(t.bodyText, vars), templateKey: t.key, userId: admin.id, meta: { test: true } });
    return okState(undefined, `Test queued to ${admin.email}.`);
  });
}

/* ------------------------------------------------------ announcements */

const AnnouncementSchema = z.object({ id: zOptionalTrimmed(64), title: zTrimmed(160).min(2), body: zTrimmed(4000).min(2), audience: z.enum(ANNOUNCEMENT_AUDIENCES), level: z.enum(["info", "success", "warning", "critical"]), startsAt: zDateOptional, endsAt: zDateOptional, isActive: zBool.optional(), notify: z.string().optional() });

export async function saveAnnouncementAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("notifications.manage", async (admin) => {
    const parsed = AnnouncementSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const data = { title: d.title, body: d.body, audience: d.audience, level: d.level, startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null, isActive: d.isActive ?? true };
    const a = d.id ? await db.announcement.update({ where: { id: d.id }, data }) : await db.announcement.create({ data: { ...data, createdById: admin.id } });
    let pushed = 0;
    if (!d.id && d.notify === "on") {
      const users = await db.user.findMany({ where: { status: "active", deletedAt: null, ...(d.audience === "sellers" ? { isSeller: true } : d.audience === "buyers" ? { isSeller: false, roleId: null } : d.audience === "admins" ? { roleId: { not: null } } : {}) }, select: { id: true } });
      if (users.length > 0) {
        await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: "announcement", title: d.title, body: d.body.slice(0, 300), href: "/account/notifications" })) });
        pushed = users.length;
      }
    }
    await audit({ actor: actorOf(admin), action: d.id ? "announcement.update" : "announcement.create", targetType: "announcement", targetId: a.id, summary: `Announcement “${d.title}” for ${d.audience}${pushed ? ` (in-app to ${pushed})` : ""}` });
    revalidatePath("/admin/notifications/announcements");
    revalidatePath("/", "layout");
    return okState(undefined, pushed ? `Announcement saved and pushed to ${pushed} users.` : "Announcement saved.");
  });
}

export async function deleteAnnouncementAction(id: string): Promise<ActionState> {
  return runAdmin("notifications.manage", async (admin) => {
    await db.announcement.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "announcement.delete", targetType: "announcement", targetId: id, summary: "Announcement deleted" });
    revalidatePath("/admin/notifications/announcements");
    revalidatePath("/", "layout");
    return okState(undefined, "Announcement deleted.");
  });
}

/* ---------------------------------------------------------- broadcast */


const BroadcastSchema = z.object({ audience: z.enum(["all", "buyers", "sellers", "admins", "marketing"]), subject: zTrimmed(160).min(3), message: zTrimmed(10_000).min(10), confirmCount: z.coerce.number().int().min(0), acknowledge: z.string().optional() });

/**
 * Queues a marketplace-wide email. Safeguards: recipient count must be re-typed,
 * one broadcast per 10 minutes, and the "broadcast" template must be enabled.
 */
export async function broadcastAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("notifications.manage", async (admin) => {
    const parsed = BroadcastSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    if (d.acknowledge !== "on") return failState("Tick the acknowledgement box.");
    const count = await audienceCount(d.audience);
    if (count === 0) return failState("Nobody matches that audience.");
    if (d.confirmCount !== count) return failState(`Type the recipient count (${count}) to confirm.`, { confirmCount: `Expected ${count}` });
    const template = await db.emailTemplate.findUnique({ where: { key: "broadcast" }, select: { isEnabled: true } });
    if (!template?.isEnabled) return failState("The “broadcast” email template is disabled.");
    const recent = await db.job.findFirst({ where: { type: "broadcast_email", createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, payloadJson: { not: { contains: '"cursor"' } } }, select: { id: true } });
    if (recent) return failState("A broadcast was queued in the last 10 minutes. Wait before sending another.");
    const jobId = await enqueueJob("broadcast_email", { audience: d.audience, subject: d.subject, message: d.message, by: admin.email });
    await audit({ actor: actorOf(admin), action: "broadcast.send", targetType: "job", targetId: jobId, summary: `Broadcast “${d.subject}” to ${d.audience} (${count} recipients)`, after: { audience: d.audience, subject: d.subject, count } });
    revalidatePath("/admin/notifications/broadcast");
    return okState(undefined, `Broadcast queued for ${count} recipient${count === 1 ? "" : "s"}. Emails go out in batches of 200.`);
  });
}

/* ---------------------------------------------------------- email log */

export async function retryEmailAction(id: string): Promise<ActionState> {
  return runAdmin("notifications.manage", async (admin) => {
    const log = await db.emailLog.findUnique({ where: { id }, select: { id: true, status: true, toEmail: true } });
    if (!log) return failState("Email not found.");
    await db.emailLog.update({ where: { id }, data: { status: "queued", error: null } });
    try {
      await deliverEmail(id);
    } catch (err) {
      return failState(`Delivery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await audit({ actor: actorOf(admin), action: "email.retry", targetType: "email", targetId: id, summary: `Email to ${log.toEmail} re-sent` });
    revalidatePath("/admin/notifications/email-log");
    return okState(undefined, "Email re-sent.");
  });
}
