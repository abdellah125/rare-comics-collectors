import "server-only";
import { db } from "@/lib/db";
import { queueTemplateEmail, type MailVars } from "@/lib/mail";

export type NotifyCategory = "orderUpdates" | "sellerAlerts" | "supportReplies" | "marketing" | "productAlerts" | "security";

/**
 * In-app notification for a user, optionally paired with a templated email.
 * Honours the user's notification preferences; security notices always send.
 */
export async function notifyUser(
  userId: string,
  input: {
    type: string;
    title: string;
    body?: string;
    href?: string;
    category?: NotifyCategory;
    email?: { templateKey: string; vars?: MailVars };
  },
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, notificationPref: true },
  });
  if (!user) return;
  const category = input.category ?? "orderUpdates";
  const pref = user.notificationPref;
  const allowed = category === "security" || !pref || pref[category as keyof typeof pref] !== false;

  await db.notification.create({
    data: { userId, type: input.type, title: input.title, body: input.body, href: input.href },
  });

  if (input.email && allowed) {
    await queueTemplateEmail(input.email.templateKey, user.email, { name: user.name, ...input.email.vars }, { userId });
  }
}

/** Notify every admin holding a permission (e.g. new seller applications → sellers.manage). */
export async function notifyAdmins(permission: string, input: { type: string; title: string; body?: string; href?: string }) {
  const roles = await db.role.findMany({ select: { id: true, permissionsJson: true } });
  const roleIds = roles.filter((r) => r.permissionsJson.includes('"*"') || r.permissionsJson.includes(`"${permission}"`)).map((r) => r.id);
  if (roleIds.length === 0) return;
  const admins = await db.user.findMany({ where: { roleId: { in: roleIds }, status: "active" }, select: { id: true } });
  if (admins.length === 0) return;
  await db.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type: input.type, title: input.title, body: input.body, href: input.href })),
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}
