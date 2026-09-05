"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, securityEvent } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { hashPassword } from "@/lib/auth/password";
import { revokeAllSessions, revokeSession, type CurrentUser } from "@/lib/auth/session";
import { hashToken, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { queueRawEmail, queueTemplateEmail } from "@/lib/mail";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { failState, fieldErrors, formToObject, okState, slugify, zEmail, zId, zOptionalTrimmed, zTrimmed, type ActionState } from "@/lib/validation";

const isSuper = (u: CurrentUser) => u.permissions.includes("*");
const elevated = (perms: string[]) => perms.includes("*") || perms.includes("admins.manage");
const rolePerms = (json: string) => JSON.parse(json) as string[];

const InviteSchema = z.object({ email: zEmail, name: zTrimmed(80).min(2), roleId: zId });

/**
 * Grants admin access. Existing accounts get the role; new ones are created
 * with an unusable random password and receive a set-password email.
 */
export async function inviteAdminAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("admins.manage", async (admin) => {
    const parsed = InviteSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const role = await db.role.findUnique({ where: { id: d.roleId } });
    if (!role) return failState("Role not found.", { roleId: "Invalid" });
    if (elevated(rolePerms(role.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can grant a role that manages admins.");
    let user = await db.user.findUnique({ where: { email: d.email }, include: { role: true } });
    let created = false;
    if (user) {
      if (user.status !== "active") return failState(`That account is ${user.status}; reactivate it first.`);
      if (user.role && elevated(rolePerms(user.role.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can change another admin-manager's role.");
      user = await db.user.update({ where: { id: user.id }, data: { roleId: role.id }, include: { role: true } });
    } else {
      const passwordHash = await hashPassword(randomToken(32));
      user = await db.user.create({ data: { email: d.email, name: d.name, passwordHash, roleId: role.id, emailVerifiedAt: new Date() }, include: { role: true } });
      created = true;
    }
    const token = randomToken();
    await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
    const resetUrl = `${env.siteUrl}/account/reset/${token}`;
    const sent = await queueTemplateEmail("admin_invite", user.email, { name: user.name, roleName: role.name, invitedBy: admin.name, resetUrl, adminUrl: `${env.siteUrl}/admin/login` }, { userId: user.id });
    if (!sent) await queueRawEmail({ to: user.email, subject: "You have been given admin access", body: `Hi ${user.name},

${admin.name} gave you the "${role.name}" role. Set your password here (valid 24 hours):
${resetUrl}

Then sign in at ${env.siteUrl}/admin/login and enrol two-factor authentication.`, templateKey: "admin_invite", userId: user.id });
    await audit({ actor: actorOf(admin), action: created ? "admin.invite" : "admin.grant", targetType: "user", targetId: user.id, summary: `${user.email} ${created ? "invited as" : "granted role"} ${role.name}` });
    await securityEvent("admin_role_granted", user.id, { roleId: role.id, by: admin.email });
    revalidatePath("/admin/admins");
    return okState(undefined, created ? `Invitation sent to ${user.email}. They set a password from the email, then must enrol 2FA.` : `${user.email} now has the ${role.name} role.`);
  });
}

export async function setAdminRoleAction(userId: string, roleId: string | null): Promise<ActionState> {
  return runAdmin("admins.manage", async (admin) => {
    if (userId === admin.id) return failState("You can't change your own role.");
    const user = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) return failState("User not found.");
    if (user.role && elevated(rolePerms(user.role.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can change this account.");
    let roleName = "none";
    if (roleId) {
      const role = await db.role.findUnique({ where: { id: roleId } });
      if (!role) return failState("Role not found.");
      if (elevated(rolePerms(role.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can grant this role.");
      roleName = role.name;
    } else if (user.role && rolePerms(user.role.permissionsJson).includes("*")) {
      const supers = await db.user.count({ where: { role: { permissionsJson: { contains: '"*"' } }, status: "active", NOT: { id: userId } } });
      if (supers === 0) return failState("That would leave the marketplace with no super admin.");
    }
    await db.user.update({ where: { id: userId }, data: { roleId } });
    if (!roleId) await revokeAllSessions(userId);
    await audit({ actor: actorOf(admin), action: roleId ? "admin.role" : "admin.revoke", targetType: "user", targetId: userId, summary: `${user.email} role → ${roleName}`, before: { role: user.role?.name ?? null }, after: { role: roleName } });
    await securityEvent(roleId ? "admin_role_changed" : "admin_access_revoked", userId, { by: admin.email, roleId });
    revalidatePath("/admin/admins");
    revalidatePath(`/admin/users/${userId}`);
    return okState(undefined, roleId ? "Role updated." : "Admin access revoked and sessions signed out.");
  });
}

export async function revokeAdminSessionsAction(userId: string): Promise<ActionState> {
  return runAdmin("admins.manage", async (admin) => {
    const target = await db.user.findUnique({ where: { id: userId }, select: { role: { select: { permissionsJson: true } } } });
    if (!target) return failState("User not found.");
    if (userId !== admin.id && target.role && elevated(rolePerms(target.role.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can sign this account out.");
    await revokeAllSessions(userId, userId === admin.id ? admin.session.id : undefined);
    await audit({ actor: actorOf(admin), action: "admin.sessions_revoked", targetType: "user", targetId: userId, summary: "All sessions revoked" });
    revalidatePath("/admin/admins");
    revalidatePath("/admin/audit");
    return okState(undefined, "Sessions revoked.");
  });
}

export async function revokeOneSessionAction(sessionId: string, userId: string): Promise<ActionState> {
  return runAdmin("audit.view", async (admin) => {
    if (!isSuper(admin) && !admin.permissions.includes("admins.manage") && userId !== admin.id) return failState("You can only revoke your own sessions.");
    await revokeSession(sessionId, userId);
    await audit({ actor: actorOf(admin), action: "session.revoke", targetType: "session", targetId: sessionId, summary: `Session revoked for user ${userId}` });
    revalidatePath("/admin/audit");
    return okState(undefined, "Session revoked.");
  });
}

const RoleSchema = z.object({ id: zOptionalTrimmed(64), name: zTrimmed(60).min(2), slug: zOptionalTrimmed(60), description: zOptionalTrimmed(300) });

export async function saveRoleAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  return runAdmin("admins.manage", async (admin) => {
    const parsed = RoleSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the form.", fieldErrors(parsed.error));
    const d = parsed.data;
    const wantsAll = formData.get("all") === "on";
    const picked = formData.getAll("permissions").map(String).filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
    const permissions: string[] = wantsAll ? ["*"] : [...new Set(picked)];
    if (permissions.length === 0) return failState("Pick at least one permission.");
    if (elevated(permissions) && !isSuper(admin)) return failState("Only a super admin can create roles that manage admins.");
    const existing = d.id ? await db.role.findUnique({ where: { id: d.id } }) : null;
    if (d.id && !existing) return failState("Role not found.");
    if (existing?.slug === "super_admin" && !permissions.includes("*")) return failState("The super admin role always keeps every permission.");
    if (existing && elevated(rolePerms(existing.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can edit this role.");
    const slug = existing?.slug ?? slugify(d.slug || d.name);
    if (!existing) {
      const clash = await db.role.findUnique({ where: { slug } });
      if (clash) return failState("Slug already used.", { slug: "In use" });
    }
    const role = existing ? await db.role.update({ where: { id: existing.id }, data: { name: d.name, description: d.description ?? null, permissionsJson: JSON.stringify(permissions) } }) : await db.role.create({ data: { slug, name: d.name, description: d.description ?? null, permissionsJson: JSON.stringify(permissions) } });
    await audit({ actor: actorOf(admin), action: existing ? "role.update" : "role.create", targetType: "role", targetId: role.id, summary: `Role ${d.name}: ${permissions.length === 1 && permissions[0] === "*" ? "all permissions" : `${permissions.length} permissions`}`, before: existing ? rolePerms(existing.permissionsJson) : undefined, after: permissions });
    revalidatePath("/admin/admins");
    return okState(undefined, "Role saved. Signed-in admins pick up the change on their next request.");
  });
}

export async function deleteRoleAction(id: string): Promise<ActionState> {
  return runAdmin("admins.manage", async (admin) => {
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) return failState("Role not found.");
    if (role.isSystem) return failState("Built-in roles can't be deleted.");
    if (role._count.users > 0) return failState("Reassign its members first.");
    if (elevated(rolePerms(role.permissionsJson)) && !isSuper(admin)) return failState("Only a super admin can delete this role.");
    await db.role.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "role.delete", targetType: "role", targetId: id, summary: `Role ${role.name} deleted` });
    revalidatePath("/admin/admins");
    return okState(undefined, "Role deleted.");
  });
}
