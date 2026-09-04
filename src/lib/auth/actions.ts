"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashToken, randomToken, decrypt } from "@/lib/crypto";
import { audit, securityEvent } from "@/lib/audit";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyCurrentSession, getCurrentUser, revokeAllSessions } from "@/lib/auth/session";
import { ensureInstanceSecrets } from "@/lib/secrets";
import { hashRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import { parseJsonArray, isString } from "@/lib/json";
import { queueTemplateEmail } from "@/lib/mail";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { requestMeta, describeDevice } from "@/lib/request-meta";
import { getSettings } from "@/lib/settings";
import { failState, fieldErrors, formToObject, okState, zEmail, zPassword, zTrimmed, type ActionState } from "@/lib/validation";

const CHALLENGE_COOKIE = "rcc_login_challenge";

/** Only ever redirect to a local path to prevent open redirects. */
export async function safeNext(next: unknown, fallback: string): Promise<string> {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

const LoginSchema = z.object({
  email: zEmail,
  password: z.string().min(1, { error: "Enter your password" }).max(200),
  remember: z.string().optional(),
  next: z.string().optional(),
  mode: z.enum(["user", "admin"]).optional(),
});

type LoginUser = NonNullable<Awaited<ReturnType<typeof db.user.findUnique>>>;

async function finishLogin(user: LoginUser, remember: boolean, asAdmin: boolean) {
  const meta = await requestMeta();
  const device = describeDevice(meta.userAgent);
  const seenBefore = await db.session.findFirst({ where: { userId: user.id, deviceLabel: device }, select: { id: true } });
  await createSession(user.id, { remember, asAdmin });
  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: meta.ip },
  });
  await securityEvent(asAdmin ? "admin_login" : "login_success", user.id, { device });
  if (!seenBefore) {
    await securityEvent("new_device", user.id, { device, ip: meta.ip });
    await queueTemplateEmail("login_new_device", user.email, { name: user.name, device, ip: meta.ip ?? "unknown" }, { userId: user.id });
  }
}

export async function loginAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await ensureInstanceSecrets();
  const parsed = LoginSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
  const { email, password } = parsed.data;
  const remember = parsed.data.remember === "on";
  const asAdmin = parsed.data.mode === "admin";
  const next = await safeNext(parsed.data.next, asAdmin ? "/admin" : "/account");
  const meta = await requestMeta();
  const settings = await getSettings();

  const limiterKey = `login:${meta.ip ?? "unknown"}:${email}`;
  const limiter = rateLimit(limiterKey, 10, 15 * 60_000);
  if (!limiter.ok) return failState(`Too many sign-in attempts. Try again in ${Math.ceil(limiter.retryAfterSeconds / 60)} minutes.`);

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) {
    await burnPasswordCheck(password);
    await securityEvent("login_failed", null, { email });
    return failState("Email or password didn't match.");
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return failState(`Too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}.`);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= settings["security.maxFailedLogins"];
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + settings["security.lockoutMinutes"] * 60_000) : null,
      },
    });
    await securityEvent(lock ? "login_locked" : "login_failed", user.id);
    return failState(lock ? "Too many failed attempts. The account is temporarily locked." : "Email or password didn't match.");
  }
  if (user.status === "banned") return failState("This account has been closed. If you think this is a mistake you can appeal at /appeal.");
  if (user.status === "suspended") return failState("This account is suspended. You can appeal at /appeal.");
  if (asAdmin && !user.roleId) {
    await securityEvent("login_failed", user.id, { reason: "not_admin" });
    return failState("This account doesn't have admin access.");
  }
  resetRateLimit(limiterKey);

  if (user.twoFactorEnabled) {
    const token = randomToken(32);
    await db.loginChallenge.create({
      data: { userId: user.id, tokenHash: hashToken(token), remember, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    (await cookies()).set(CHALLENGE_COOKIE, `${token}.${asAdmin ? "a" : "u"}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProd,
      path: "/",
      maxAge: 600,
    });
    redirect(`${asAdmin ? "/admin/login/verify" : "/account/login/verify"}?next=${encodeURIComponent(next)}`);
  }

  await finishLogin(user, remember, asAdmin);
  redirect(next);
}

const VerifySchema = z.object({ code: zTrimmed(64), next: z.string().optional() });

export async function verifyTwoFactorAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await ensureInstanceSecrets();
  const parsed = VerifySchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Enter the 6-digit code from your authenticator app.");
  const store = await cookies();
  const raw = store.get(CHALLENGE_COOKIE)?.value;
  if (!raw) return failState("Your sign-in session expired. Please sign in again.");
  const [token, modeFlag] = raw.split(".");
  const asAdmin = modeFlag === "a";
  const meta = await requestMeta();
  const limiter = rateLimit(`2fa:${meta.ip ?? "unknown"}`, 10, 10 * 60_000);
  if (!limiter.ok) return failState("Too many attempts. Please sign in again in a few minutes.");

  const challenge = await db.loginChallenge.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
    store.delete(CHALLENGE_COOKIE);
    return failState("Your sign-in session expired. Please sign in again.");
  }
  const user = challenge.user;
  const code = parsed.data.code.replace(/\s+/g, "");
  let valid = false;
  if (/^\d{6}$/.test(code) && user.twoFactorSecretEnc) {
    valid = verifyTotp(decrypt(user.twoFactorSecretEnc), code);
  } else {
    // Recovery code: single use.
    const hashes = parseJsonArray(user.recoveryCodesJson, isString);
    const h = hashRecoveryCode(code);
    if (hashes.includes(h)) {
      valid = true;
      await db.user.update({ where: { id: user.id }, data: { recoveryCodesJson: JSON.stringify(hashes.filter((x) => x !== h)) } });
      await securityEvent("recovery_code_used", user.id);
    }
  }
  if (!valid) {
    await securityEvent("login_failed", user.id, { reason: "2fa" });
    return failState("That code isn't valid. Codes change every 30 seconds.");
  }
  await db.loginChallenge.delete({ where: { id: challenge.id } });
  store.delete(CHALLENGE_COOKIE);
  await finishLogin(user, challenge.remember, asAdmin);
  redirect(await safeNext(parsed.data.next, asAdmin ? "/admin" : "/account"));
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await securityEvent("logout", user.id);
}

const RegisterSchema = z.object({
  firstName: zTrimmed(80).min(1, { error: "Enter your first name" }),
  lastName: zTrimmed(80).min(1, { error: "Enter your last name" }),
  email: zEmail,
  password: zPassword,
  terms: z.string().optional(),
  next: z.string().optional(),
});

export async function registerAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const parsed = RegisterSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
  if (parsed.data.terms !== "on") return failState("Please accept the terms to continue.", { terms: "Required" });
  const meta = await requestMeta();
  const limiter = rateLimit(`register:${meta.ip ?? "unknown"}`, 5, 60 * 60_000);
  if (!limiter.ok) return failState("Too many accounts created from this network. Try again later.");

  const { email, password, firstName, lastName } = parsed.data;
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return failState("That email is already registered. Try signing in instead.", { email: "Already registered" });
  const settings = await getSettings();
  const user = await db.user.create({
    data: {
      email,
      name: `${firstName} ${lastName}`.trim(),
      passwordHash: await hashPassword(password),
      countryCode: settings["marketplace.defaultCountry"],
      currency: settings["marketplace.baseCurrency"],
      timezone: settings["marketplace.timezone"],
      notificationPref: { create: {} },
    },
  });
  await audit({ actor: { id: user.id, email: user.email, type: "user" }, action: "user.register", targetType: "user", targetId: user.id, summary: `${email} created an account` });
  await queueTemplateEmail("welcome", email, { name: firstName }, { userId: user.id });
  await createSession(user.id, { remember: true });
  await securityEvent("login_success", user.id, { via: "register" });
  redirect(await safeNext(parsed.data.next, "/account"));
}

const ResetRequestSchema = z.object({ email: zEmail });

export async function requestPasswordResetAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const parsed = ResetRequestSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Enter a valid email address.", fieldErrors(parsed.error));
  const meta = await requestMeta();
  const limiter = rateLimit(`reset:${meta.ip ?? "unknown"}`, 5, 15 * 60_000);
  if (!limiter.ok) return failState("Too many reset requests. Try again in a few minutes.");
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user && !user.deletedAt && user.status !== "banned") {
    const token = randomToken(32);
    await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await queueTemplateEmail("password_reset", user.email, { name: user.name, resetUrl: `${env.siteUrl}/account/reset/${token}` }, { userId: user.id });
    await securityEvent("password_reset_requested", user.id);
  }
  return okState(undefined, "If that address matches an account, a reset link is on its way.");
}

const ResetSchema = z.object({ token: z.string().min(10).max(200), password: zPassword, confirm: z.string() });

export async function resetPasswordAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  const parsed = ResetSchema.safeParse(formToObject(formData));
  if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
  if (parsed.data.password !== parsed.data.confirm) return failState("Passwords don't match.", { confirm: "Must match the new password" });
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(parsed.data.token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return failState("This reset link is invalid or has expired. Request a new one.");
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(parsed.data.password), failedLoginCount: 0, lockedUntil: null } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllSessions(record.userId);
  await securityEvent("password_reset", record.userId);
  await audit({ actor: { id: record.userId, email: record.user.email, type: "user" }, action: "user.password_reset", targetType: "user", targetId: record.userId, summary: "Password reset via email link" });
  redirect("/account/login?reset=1");
}
