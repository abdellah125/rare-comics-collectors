"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit, securityEvent } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth/session";
import { hashToken, randomToken } from "@/lib/crypto";
import { actorOf, domainError, runAdmin } from "@/lib/admin/guard";
import { isElevated, isSuperAdmin, mayActOnAdmin, rolePermissions } from "@/lib/admin/elevation";
import { USER_RESTRICTIONS, USER_STATUSES } from "@/lib/domain";
import { queueTemplateEmail } from "@/lib/mail";
import { notifyUser } from "@/lib/notifications";
import { failState, fieldErrors, formToObject, okState, zBool, zEmail, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const ProfileSchema = z.object({
  id: zId,
  name: zTrimmed(120).min(2),
  email: zEmail,
  phone: zOptionalTrimmed(40),
  countryCode: zOptionalTrimmed(2),
  timezone: zOptionalTrimmed(64),
  currency: zOptionalTrimmed(3),
  adminNotes: zOptionalTrimmed(4000),
  emailVerified: zBool.optional(),
});

export async function updateUserAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const parsed = ProfileSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const d = parsed.data;
    const before = await db.user.findUnique({ where: { id: d.id }, select: { name: true, email: true, phone: true, countryCode: true, emailVerifiedAt: true, roleId: true, role: { select: { permissionsJson: true } } } });
    if (!before) return failState("User not found.");
    if (before.role && d.id !== admin.id) {
      if (!admin.permissions.includes("*") && !admin.permissions.includes("admins.manage")) return failState("Only admins with the admins.manage permission can edit other admin accounts.");
      if (!mayActOnAdmin(admin, before.role.permissionsJson)) return failState("Only a super admin can edit this account.");
    }
    const clash = await db.user.findFirst({ where: { email: d.email, NOT: { id: d.id } }, select: { id: true } });
    if (clash) return failState("That email belongs to another account.", { email: "In use" });
    await db.user.update({
      where: { id: d.id },
      data: {
        name: d.name,
        email: d.email,
        phone: d.phone ?? null,
        countryCode: d.countryCode?.toUpperCase() ?? null,
        timezone: d.timezone || undefined,
        currency: d.currency?.toUpperCase() || undefined,
        adminNotes: d.adminNotes ?? null,
        emailVerifiedAt: d.emailVerified ? (before.emailVerifiedAt ?? new Date()) : null,
      },
    });
    await audit({ actor: actorOf(admin), action: "user.update", targetType: "user", targetId: d.id, summary: `Edited user ${d.email}`, before, after: { name: d.name, email: d.email, phone: d.phone, countryCode: d.countryCode } });
    revalidatePath(`/admin/users/${d.id}`);
    return okState(undefined, "User saved.");
  });
}

export async function setUserStatusAction(id: string, status: string, reason?: string): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    if (!(USER_STATUSES as readonly string[]).includes(status)) return failState("Unknown status.");
    if (id === admin.id) return failState("You can't change your own account status.");
    const user = await db.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) return failState("User not found.");
    if (user.role && !admin.permissions.includes("*") && !admin.permissions.includes("admins.manage")) return failState("Only admins with admins.manage can change another admin's status.");
    if (user.role && !mayActOnAdmin(admin, user.role.permissionsJson)) return failState("Only a super admin can change this account.");
    if ((status === "suspended" || status === "banned") && !reason?.trim()) return failState("A reason is required.");
    await db.user.update({ where: { id }, data: { status, statusReason: reason?.trim() || null } });
    if (status === "suspended" || status === "banned") {
      await revokeAllSessions(id);
      await securityEvent("account_" + status, id, { by: admin.email });
    }
    await audit({ actor: actorOf(admin), action: `user.status.${status}`, targetType: "user", targetId: id, summary: `${user.email}: ${user.status} → ${status}${reason ? ` (${reason})` : ""}` });
    await queueTemplateEmail("account_status", user.email, { name: user.name, status, reason: reason ?? "" }, { userId: id });
    revalidatePath(`/admin/users/${id}`);
    revalidatePath("/admin/users");
    return okState(undefined, `Account ${status}.`);
  });
}

const RestrictionsSchema = z.object({ id: zId, restrictions: z.union([z.string(), z.array(z.string())]).optional() });

export async function setUserRestrictionsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const parsed = RestrictionsSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Invalid input.");
    const raw = parsed.data.restrictions;
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((r) => (USER_RESTRICTIONS as readonly string[]).includes(r));
    const user = await db.user.findUnique({ where: { id: parsed.data.id }, select: { email: true, restrictionsJson: true } });
    if (!user) return failState("User not found.");
    await db.user.update({ where: { id: parsed.data.id }, data: { restrictionsJson: JSON.stringify(list), status: list.length > 0 ? "restricted" : "active" } });
    await audit({ actor: actorOf(admin), action: "user.restrictions", targetType: "user", targetId: parsed.data.id, summary: `${user.email} restrictions: ${list.join(", ") || "none"}`, before: JSON.parse(user.restrictionsJson), after: list });
    revalidatePath(`/admin/users/${parsed.data.id}`);
    return okState(undefined, "Restrictions saved.");
  });
}

export async function sendPasswordResetAction(id: string): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const user = await db.user.findUnique({ where: { id }, select: { email: true, name: true, role: { select: { permissionsJson: true } } } });
    if (!user) return failState("User not found.");
    if (user.role && !mayActOnAdmin(admin, user.role.permissionsJson)) return failState("Only a super admin can reset this account's password.");
    const token = randomToken(32);
    await db.passwordResetToken.create({ data: { userId: id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await queueTemplateEmail("password_reset", user.email, { name: user.name, resetUrl: `${env.siteUrl}/account/reset/${token}` }, { userId: id });
    await audit({ actor: actorOf(admin), action: "user.password_reset_sent", targetType: "user", targetId: id, summary: `Password reset email sent to ${user.email}` });
    return okState(undefined, "Reset email queued.");
  });
}

export async function revokeUserSessionsAction(id: string): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const target = await db.user.findUnique({ where: { id }, select: { role: { select: { permissionsJson: true } } } });
    if (!target) return failState("User not found.");
    if (target.role && !mayActOnAdmin(admin, target.role.permissionsJson)) return failState("Only a super admin can sign this account out.");
    await revokeAllSessions(id);
    await securityEvent("session_revoked", id, { by: admin.email, all: true });
    await audit({ actor: actorOf(admin), action: "user.sessions_revoked", targetType: "user", targetId: id, summary: "All sessions revoked by admin" });
    revalidatePath(`/admin/users/${id}`);
    return okState(undefined, "All sessions signed out.");
  });
}

export async function disableUserTwoFactorAction(id: string, reason?: string): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const user = await db.user.findUnique({ where: { id }, select: { email: true, roleId: true, role: { select: { permissionsJson: true } } } });
    if (!user) return failState("User not found.");
    if (user.roleId && !admin.permissions.includes("*") && !admin.permissions.includes("admins.manage")) return failState("Only admins.manage can reset another admin's 2FA.");
    if (user.role && !mayActOnAdmin(admin, user.role.permissionsJson)) return failState("Only a super admin can reset this account's 2FA.");
    await db.user.update({ where: { id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, recoveryCodesJson: null } });
    await revokeAllSessions(id);
    await securityEvent("twofa_disabled", id, { by: admin.email, reason });
    await audit({ actor: actorOf(admin), action: "user.2fa_reset", targetType: "user", targetId: id, summary: `2FA reset for ${user.email}${reason ? ` (${reason})` : ""}` });
    revalidatePath(`/admin/users/${id}`);
    return okState(undefined, "Two-factor authentication reset. The user must set it up again.");
  });
}

export async function setUserRoleAction(id: string, roleId: string | null): Promise<ActionState> {
  return runAdmin("admins.manage", async (admin) => {
    if (id === admin.id) return failState("You can't change your own role.");
    const user = await db.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) return failState("User not found.");
    const role = roleId ? await db.role.findUnique({ where: { id: roleId } }) : null;
    if (roleId && !role) return failState("Role not found.");
    if (user.role && !mayActOnAdmin(admin, user.role.permissionsJson)) return failState("Only a super admin can change this account's role.");
    if (role && isElevated(rolePermissions(role.permissionsJson)) && !isSuperAdmin(admin)) return failState("Only a super admin can grant a role that manages admins.");
    if (user.role && rolePermissions(user.role.permissionsJson).includes("*") && !(role && rolePermissions(role.permissionsJson).includes("*"))) {
      const supers = await db.user.count({ where: { role: { permissionsJson: { contains: '"*"' } }, status: "active", deletedAt: null, NOT: { id } } });
      if (supers === 0) return failState("There must always be at least one active Super Admin.");
    }
    await db.user.update({ where: { id }, data: { roleId: role?.id ?? null } });
    await revokeAllSessions(id);
    await audit({ actor: actorOf(admin), action: "user.role", targetType: "user", targetId: id, summary: `${user.email} role: ${user.role?.name ?? "none"} → ${role?.name ?? "none"}` });
    await notifyUser(id, { type: "account.role", title: role ? `You've been given the ${role.name} role` : "Admin access removed", body: role ? "Sign in at /admin. Two-factor authentication is required." : undefined, href: role ? "/admin" : "/account", category: "security" });
    revalidatePath(`/admin/users/${id}`);
    revalidatePath("/admin/admins");
    return okState(undefined, role ? `Role set to ${role.name}.` : "Admin access removed.");
  });
}

/** GDPR-style anonymisation: personal data is removed, financial records stay. */
export async function anonymizeUserAction(id: string, reason?: string): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    if (id === admin.id) return failState("You can't delete your own account here.");
    const user = await db.user.findUnique({ where: { id }, select: { email: true, roleId: true, deletedAt: true } });
    if (!user) return failState("User not found.");
    if (user.deletedAt) return failState("Already deleted.");
    if (user.roleId) return failState("Remove admin access before deleting this account.");
    if (!reason?.trim()) return failState("A reason is required.");
    const anonEmail = `deleted+${id}@anonymised.invalid`;
    await db.$transaction([
      db.session.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } }),
      db.address.deleteMany({ where: { userId: id } }),
      db.notification.deleteMany({ where: { userId: id } }),
      db.passwordResetToken.deleteMany({ where: { userId: id } }),
      db.user.update({ where: { id }, data: { email: anonEmail, name: "Deleted user", phone: null, passwordHash: "!", twoFactorEnabled: false, twoFactorSecretEnc: null, recoveryCodesJson: null, adminNotes: null, status: "banned", statusReason: "Account deleted", deletedAt: new Date(), marketingOptIn: false } }),
    ]);
    await audit({ actor: actorOf(admin), action: "user.anonymize", targetType: "user", targetId: id, summary: `Account ${user.email} anonymised (${reason})` });
    revalidatePath(`/admin/users/${id}`);
    revalidatePath("/admin/users");
    return okState(undefined, "Account anonymised.");
  });
}

export async function bulkUsersAction(actionId: string, ids: string[]): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const targets = ids.filter((id) => id !== admin.id).slice(0, 200);
    if (targets.length === 0) return failState("Nothing selected.");
    const nonAdmins = await db.user.findMany({ where: { id: { in: targets }, roleId: null, deletedAt: null }, select: { id: true } });
    const safeIds = nonAdmins.map((u) => u.id);
    let summary = "";
    switch (actionId) {
      case "suspend":
        await db.user.updateMany({ where: { id: { in: safeIds } }, data: { status: "suspended", statusReason: "Bulk suspension by admin" } });
        await db.session.updateMany({ where: { userId: { in: safeIds }, revokedAt: null }, data: { revokedAt: new Date() } });
        summary = `Suspended ${safeIds.length} users`;
        break;
      case "reactivate":
        await db.user.updateMany({ where: { id: { in: safeIds } }, data: { status: "active", statusReason: null, restrictionsJson: "[]" } });
        summary = `Reactivated ${safeIds.length} users`;
        break;
      case "restrict_purchase":
        await db.user.updateMany({ where: { id: { in: safeIds } }, data: { status: "restricted", restrictionsJson: JSON.stringify(["no_purchase"]) } });
        summary = `Purchase-restricted ${safeIds.length} users`;
        break;
      case "send_reset":
        for (const id of safeIds) await sendPasswordResetAction(id);
        summary = `Password reset sent to ${safeIds.length} users`;
        break;
      default:
        return failState("Unknown action.");
    }
    await audit({ actor: actorOf(admin), action: `user.bulk.${actionId}`, targetType: "user", summary, after: { ids: safeIds } });
    revalidatePath("/admin/users");
    return okState(undefined, summary);
  });
}

export async function addUserNoteAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("users.manage", async (admin) => {
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    if (!id || !note) return failState("Write a note.");
    const user = await db.user.findUnique({ where: { id }, select: { adminNotes: true } });
    if (!user) domainError("User not found");
    const stamp = `[${new Date().toISOString().slice(0, 16).replace("T", " ")} ${admin.name}] ${note}`;
    await db.user.update({ where: { id }, data: { adminNotes: user.adminNotes ? `${user.adminNotes}\n${stamp}` : stamp } });
    await audit({ actor: actorOf(admin), action: "user.note", targetType: "user", targetId: id, summary: `Note added: ${note.slice(0, 80)}` });
    revalidatePath(`/admin/users/${id}`);
    return okState(undefined, "Note added.");
  });
}
