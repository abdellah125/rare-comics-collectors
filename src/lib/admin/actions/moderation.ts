"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { revokeAllSessions } from "@/lib/auth/session";
import { USER_RESTRICTIONS, VIOLATION_ACTIONS, VIOLATION_SEVERITIES, VIOLATION_TYPES } from "@/lib/domain";
import { queueRawEmail } from "@/lib/mail";
import { notifyUser } from "@/lib/notifications";
import { failState, fieldErrors, formToObject, okState, zDateOptional, zEmail, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

/* ----------------------------------------------------------- reports */

export async function setReportStatusAction(id: string, status: "reviewing" | "resolved" | "dismissed", resolution?: string): Promise<ActionState> {
  return runAdmin("moderation.manage", async (admin) => {
    const report = await db.report.findUnique({ where: { id } });
    if (!report) return failState("Report not found.");
    await db.report.update({ where: { id }, data: { status, resolution: resolution?.trim() || report.resolution, handledById: admin.id } });
    if (status === "dismissed" && report.targetType === "review") {
      const open = await db.report.count({ where: { targetType: "review", targetId: report.targetId, status: { in: ["open", "reviewing"] } } });
      if (open === 0) await db.review.updateMany({ where: { id: report.targetId }, data: { reportCount: 0 } });
    }
    await audit({ actor: actorOf(admin), action: `report.${status}`, targetType: "report", targetId: id, summary: `Report on ${report.targetType} ${report.targetId} ${status}${resolution ? `: ${resolution}` : ""}` });
    if (report.reporterId && (status === "resolved" || status === "dismissed")) {
      await notifyUser(report.reporterId, { type: "report.closed", title: `Thanks — your report was ${status}`, body: status === "resolved" ? "We took action on the content you reported." : "We reviewed it and found no policy breach.", category: "security" });
    }
    revalidatePath(`/admin/moderation/${id}`);
    revalidatePath("/admin/moderation");
    return okState(undefined, `Report ${status}.`);
  });
}

export async function bulkReportsAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("moderation.manage", async (admin) => {
    if (actionId !== "dismiss" && actionId !== "reviewing") return failState("Unknown action.");
    const status = actionId === "dismiss" ? "dismissed" : "reviewing";
    const n = await db.report.updateMany({ where: { id: { in: ids.slice(0, 200) }, status: { in: ["open", "reviewing"] } }, data: { status, handledById: admin.id } });
    await audit({ actor: actorOf(admin), action: `report.bulk.${status}`, targetType: "report", summary: `${n.count} reports ${status}`, after: ids });
    revalidatePath("/admin/moderation");
    return okState(undefined, `${n.count} reports ${status}.`);
  });
}

/* -------------------------------------------------------- violations */

const ViolationSchema = z.object({
  email: zEmail,
  type: z.enum(VIOLATION_TYPES),
  severity: z.enum(VIOLATION_SEVERITIES),
  actionTaken: z.enum(VIOLATION_ACTIONS),
  description: zTrimmed(2000).min(5),
  expiresAt: zDateOptional,
  restrictions: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.enum(USER_RESTRICTIONS))),
  reportId: zOptionalTrimmed(64),
  notify: z.string().optional(),
});

/** Records a violation and applies the chosen enforcement action to the account. */
export async function issueViolationAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("moderation.manage", async (admin) => {
    const parsed = ViolationSchema.safeParse({ ...formToObject(formData), restrictions: formData.getAll("restrictions") });
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const user = await db.user.findUnique({ where: { email: d.email.toLowerCase() }, include: { sellerProfile: { select: { id: true } }, role: { select: { id: true } } } });
    if (!user) return failState("No account with that email.", { email: "Not found" });
    if (user.id === admin.id) return failState("You can't issue a violation against yourself.");
    if (user.role && !admin.permissions.includes("*")) return failState("Only a super admin can act against another admin account.");
    const expiresAt = d.expiresAt ?? null;
    const violation = await db.violation.create({ data: { userId: user.id, sellerId: user.sellerProfile?.id ?? null, type: d.type, severity: d.severity, description: d.description, actionTaken: d.actionTaken, expiresAt, issuedById: admin.id } });
    const before = { status: user.status, restrictions: user.restrictionsJson };
    if (d.actionTaken === "suspension" || d.actionTaken === "ban") {
      await db.user.update({ where: { id: user.id }, data: { status: d.actionTaken === "ban" ? "banned" : "suspended", statusReason: `${d.type}: ${d.description}`.slice(0, 500) } });
      await revokeAllSessions(user.id);
      if (user.sellerProfile) await db.sellerProfile.update({ where: { id: user.sellerProfile.id }, data: { status: "suspended" } });
      if (user.sellerProfile) await db.product.updateMany({ where: { sellerId: user.sellerProfile.id, status: "published" }, data: { status: "suspended" } });
    } else if (d.actionTaken === "restriction") {
      const current = new Set<string>(JSON.parse(user.restrictionsJson || "[]") as string[]);
      for (const r of d.restrictions) current.add(r);
      await db.user.update({ where: { id: user.id }, data: { status: "restricted", restrictionsJson: JSON.stringify([...current]) } });
    }
    if (d.reportId) await db.report.updateMany({ where: { id: d.reportId }, data: { status: "resolved", handledById: admin.id, resolution: `Violation issued (${d.actionTaken})` } });
    await audit({ actor: actorOf(admin), action: `violation.${d.actionTaken}`, targetType: "user", targetId: user.id, summary: `${d.severity} ${d.type} violation → ${d.actionTaken} for ${user.email}`, before, after: { violationId: violation.id, restrictions: d.restrictions, expiresAt } });
    if (d.notify === "on") {
      const subject = `Important: a policy notice on your Rare Comics Collectors account`;
      const body = `Hello ${user.name},\n\nWe recorded a ${d.severity}-severity ${d.type.replace(/_/g, " ")} violation on your account.\n\n${d.description}\n\nAction taken: ${d.actionTaken}${expiresAt ? ` until ${expiresAt.toUTCString()}` : ""}.\n\nIf you believe this is a mistake you can appeal from your account's Security page or at ${env.siteUrl}/appeal.\n\n— Trust & Safety`;
      await queueRawEmail({ to: user.email, subject, body, userId: user.id, templateKey: "violation_notice" });
      await notifyUser(user.id, { type: "violation", title: "Policy notice on your account", body: `${d.type.replace(/_/g, " ")} — action: ${d.actionTaken}`, href: "/account/security", category: "security" });
    }
    revalidatePath("/admin/moderation/violations");
    revalidatePath(`/admin/users/${user.id}`);
    return okState(undefined, `Violation recorded and ${d.actionTaken === "none" ? "no action applied" : d.actionTaken + " applied"}.`);
  });
}

export async function revokeViolationAction(id: string, note?: string): Promise<ActionState> {
  return runAdmin("moderation.manage", async (admin) => {
    const v = await db.violation.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, status: true } } } });
    if (!v) return failState("Violation not found.");
    await db.violation.update({ where: { id }, data: { status: "revoked" } });
    if ((v.actionTaken === "suspension" || v.actionTaken === "ban") && (v.user.status === "suspended" || v.user.status === "banned")) {
      const others = await db.violation.count({ where: { userId: v.userId, status: "active", actionTaken: { in: ["suspension", "ban"] }, NOT: { id } } });
      if (others === 0) await db.user.update({ where: { id: v.userId }, data: { status: "active", statusReason: null } });
    }
    await audit({ actor: actorOf(admin), action: "violation.revoke", targetType: "user", targetId: v.userId, summary: `Violation ${v.type} revoked for ${v.user.email}${note ? `: ${note}` : ""}` });
    revalidatePath("/admin/moderation/violations");
    revalidatePath(`/admin/users/${v.userId}`);
    return okState(undefined, "Violation revoked.");
  });
}

/* ----------------------------------------------------------- appeals */

export async function decideAppealAction(id: string, decision: "accepted" | "rejected", note?: string): Promise<ActionState> {
  return runAdmin("moderation.manage", async (admin) => {
    const a = await db.appeal.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, name: true } }, violation: true } });
    if (!a) return failState("Appeal not found.");
    if (a.status !== "pending") return failState("Already decided.");
    await db.appeal.update({ where: { id }, data: { status: decision, decisionNote: note?.trim() || null, decidedById: admin.id, decidedAt: new Date() } });
    if (decision === "accepted") {
      if (a.violation) await db.violation.update({ where: { id: a.violation.id }, data: { status: "revoked" } });
      const blocking = await db.violation.count({ where: { userId: a.userId, status: "active", actionTaken: { in: ["suspension", "ban"] } } });
      if (blocking === 0) await db.user.update({ where: { id: a.userId }, data: { status: "active", statusReason: null, restrictionsJson: a.violation?.actionTaken === "restriction" ? "[]" : undefined } });
    }
    await audit({ actor: actorOf(admin), action: `appeal.${decision}`, targetType: "user", targetId: a.userId, summary: `Appeal ${decision} for ${a.user.email}${note ? `: ${note}` : ""}` });
    await notifyUser(a.userId, { type: "appeal.decided", title: `Your appeal was ${decision}`, body: note || (decision === "accepted" ? "The restriction has been lifted." : "The original decision stands."), href: "/account/security", category: "security" });
    await queueRawEmail({ to: a.user.email, subject: `Your appeal was ${decision}`, body: `Hello ${a.user.name},\n\nYour appeal has been ${decision}.${note ? `\n\n${note}` : ""}\n\n— Trust & Safety`, userId: a.userId, templateKey: "appeal_decision" });
    revalidatePath("/admin/moderation/appeals");
    revalidatePath(`/admin/users/${a.userId}`);
    return okState(undefined, `Appeal ${decision}.`);
  });
}

