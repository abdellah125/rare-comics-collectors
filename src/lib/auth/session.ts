import "server-only";
import { ensureInstanceSecrets } from "@/lib/secrets";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken, randomToken } from "@/lib/crypto";
import { parseJsonArray, isString } from "@/lib/json";
import { hasPermission, type Permission } from "@/lib/permissions";
import { requestMeta, describeDevice } from "@/lib/request-meta";
import { getSettings } from "@/lib/settings";
import { securityEvent } from "@/lib/audit";

export const SESSION_COOKIE = "rcc_session";
/** Holds the admin's own session token while they impersonate a user. */
export const IMPERSONATOR_COOKIE = "rcc_admin_session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  isSeller: boolean;
  locale: string;
  currency: string;
  timezone: string;
  countryCode: string | null;
  twoFactorEnabled: boolean;
  restrictions: string[];
  role: { id: string; slug: string; name: string } | null;
  permissions: string[];
  isAdmin: boolean;
  seller: { id: string; slug: string; status: string; displayName: string } | null;
  session: { id: string; createdAt: Date; impersonatorId: string | null };
  impersonator: { id: string; name: string; email: string } | null;
};

export class AuthError extends Error {
  status: 401 | 403;
  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function cookieOptions(expires: Date | undefined) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProd,
    path: "/",
    expires,
  };
}

type SessionWithUser = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

async function loadSession(tokenHash: string) {
  return db.session.findUnique({
    where: { tokenHash },
    include: {
      impersonator: { select: { id: true, name: true, email: true } },
      user: {
        include: {
          role: true,
          sellerProfile: { select: { id: true, slug: true, status: true, displayName: true } },
        },
      },
    },
  });
}

function toCurrentUser(s: SessionWithUser): CurrentUser {
  const u = s.user;
  const permissions = u.role ? parseJsonArray(u.role.permissionsJson, isString) : [];
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    isSeller: u.isSeller,
    locale: u.locale,
    currency: u.currency,
    timezone: u.timezone,
    countryCode: u.countryCode,
    twoFactorEnabled: u.twoFactorEnabled,
    restrictions: parseJsonArray(u.restrictionsJson, isString),
    role: u.role ? { id: u.role.id, slug: u.role.slug, name: u.role.name } : null,
    permissions,
    isAdmin: permissions.length > 0,
    seller: u.sellerProfile,
    session: { id: s.id, createdAt: s.createdAt, impersonatorId: s.impersonatorId },
    impersonator: s.impersonator,
  };
}

/**
 * Resolves the signed-in user from the session cookie. Memoised per request.
 * Returns null for missing/expired/revoked sessions and banned or deleted users.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await ensureInstanceSecrets();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await loadSession(hashToken(token));
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.deletedAt || session.user.status === "banned") return null;

  const settings = await getSettings();
  const isAdmin = Boolean(session.user.role);
  if (isAdmin) {
    const idleMs = settings["security.adminIdleMinutes"] * 60_000;
    if (Date.now() - session.lastSeenAt.getTime() > idleMs) {
      await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return null;
    }
  }
  // Touch lastSeenAt at most every 5 minutes, after the response is sent.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    const id = session.id;
    after(async () => {
      await db.session.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    });
  }
  return toCurrentUser(session);
});

export async function createSession(
  userId: string,
  opts: { remember?: boolean; impersonatorId?: string | null; asAdmin?: boolean } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const settings = await getSettings();
  const meta = await requestMeta();
  const hours = opts.impersonatorId
    ? settings["security.impersonationMinutes"] / 60
    : opts.asAdmin
      ? settings["security.adminSessionHours"]
      : opts.remember
        ? settings["security.sessionDaysRemember"] * 24
        : settings["security.sessionHoursDefault"];
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  const token = randomToken(32);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
      deviceLabel: describeDevice(meta.userAgent),
      impersonatorId: opts.impersonatorId ?? null,
    },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(opts.remember || opts.asAdmin ? expiresAt : undefined));
  return { token, expiresAt };
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  store.delete(SESSION_COOKIE);
  store.delete(IMPERSONATOR_COOKIE);
}

export async function revokeSession(sessionId: string, userId: string) {
  await db.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/* ------------------------------------------------------------- guards */

export async function requireUser(opts: { next?: string } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/account/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ""}`);
  if (user.status === "suspended") redirect("/appeal");
  return user;
}

/** Throwing variant for server actions and route handlers. */
export async function assertUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Please sign in", 401);
  if (user.status === "suspended") throw new AuthError("This account is suspended", 403);
  return user;
}

export async function requireSeller(opts: { next?: string } = {}): Promise<CurrentUser & { seller: NonNullable<CurrentUser["seller"]> }> {
  const user = await requireUser(opts);
  if (!user.seller) redirect("/account/seller");
  return user as CurrentUser & { seller: NonNullable<CurrentUser["seller"]> };
}

export async function assertSeller(): Promise<CurrentUser & { seller: NonNullable<CurrentUser["seller"]> }> {
  const user = await assertUser();
  if (!user.seller) throw new AuthError("Seller account required", 403);
  if (user.seller.status !== "approved") throw new AuthError("Your seller account is not active", 403);
  if (user.restrictions.includes("no_sell")) throw new AuthError("Selling is restricted on this account", 403);
  return user as CurrentUser & { seller: NonNullable<CurrentUser["seller"]> };
}

export type AdminGate = "login" | "not_admin" | "suspended" | "setup_2fa" | "ok";

/** Why (or whether) the current user may use the admin panel — used by the admin layout to pick its chrome. */
export async function adminAccessState(): Promise<{ user: CurrentUser | null; gate: AdminGate }> {
  const user = await getCurrentUser();
  return { user, gate: await adminGate(user) };
}

async function adminGate(user: CurrentUser | null): Promise<AdminGate> {
  if (!user) return "login";
  if (user.status !== "active") return "suspended";
  if (!user.isAdmin) return "not_admin";
  if (user.impersonator) return "not_admin"; // an impersonation session never grants admin
  const settings = await getSettings();
  if (settings["security.adminRequire2fa"] && !user.twoFactorEnabled) return "setup_2fa";
  return "ok";
}

/**
 * Page guard: redirects to the admin sign-in, forced 2FA enrolment, or the
 * "access denied" page. Always call it at the top of every admin page and
 * inside every admin server action (via assertAdmin) — layouts are not enough.
 */
export async function requireAdmin(permission?: Permission, opts: { next?: string } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const gate = await adminGate(user);
  const next = opts.next ? `?next=${encodeURIComponent(opts.next)}` : "";
  if (gate === "login") redirect(`/admin/login${next}`);
  if (gate === "suspended") redirect("/admin/login?error=suspended");
  if (gate === "not_admin") redirect("/admin/login?error=not_admin");
  if (gate === "setup_2fa") redirect("/admin/setup-2fa");
  if (permission && !hasPermission(user!.permissions, permission)) redirect(`/admin/denied?need=${encodeURIComponent(permission)}`);
  return user!;
}

export async function assertAdmin(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  const gate = await adminGate(user);
  if (gate !== "ok") throw new AuthError(gate === "login" ? "Please sign in" : "Admin access required", gate === "login" ? 401 : 403);
  if (permission && !hasPermission(user!.permissions, permission)) throw new AuthError(`Missing permission: ${permission}`, 403);
  return user!;
}

export function can(user: CurrentUser | null, permission: Permission): boolean {
  return Boolean(user && hasPermission(user.permissions, permission));
}

/* ------------------------------------------------------ impersonation */

export async function startImpersonation(admin: CurrentUser, targetUserId: string) {
  const store = await cookies();
  const adminToken = store.get(SESSION_COOKIE)?.value;
  if (!adminToken) throw new AuthError("No admin session", 401);
  const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: { select: { id: true } }, status: true } });
  if (!target) throw new Error("User not found");
  if (target.role) throw new AuthError("Admins cannot impersonate other admins", 403);
  if (target.status === "banned") throw new AuthError("Cannot impersonate a banned user", 403);
  const { expiresAt } = await createSession(target.id, { impersonatorId: admin.id });
  store.set(IMPERSONATOR_COOKIE, adminToken, cookieOptions(expiresAt));
  await securityEvent("impersonation_started", target.id, { adminId: admin.id });
}

export async function stopImpersonation(): Promise<boolean> {
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;
  const adminToken = store.get(IMPERSONATOR_COOKIE)?.value;
  if (current) {
    await db.session.updateMany({ where: { tokenHash: hashToken(current), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  store.delete(IMPERSONATOR_COOKIE);
  if (!adminToken) {
    store.delete(SESSION_COOKIE);
    return false;
  }
  const adminSession = await loadSession(hashToken(adminToken));
  if (!adminSession || adminSession.revokedAt || adminSession.expiresAt.getTime() < Date.now()) {
    store.delete(SESSION_COOKIE);
    return false;
  }
  store.set(SESSION_COOKIE, adminToken, cookieOptions(adminSession.expiresAt));
  return true;
}
