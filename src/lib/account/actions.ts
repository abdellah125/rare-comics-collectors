"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { CURRENCY_COOKIE } from "@/lib/currency";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { env } from "@/lib/env";
import { audit, securityEvent } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { assertUser, revokeAllSessions, revokeSession, AuthError } from "@/lib/auth/session";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, totpQrDataUrl, verifyTotp } from "@/lib/auth/totp";
import { decrypt, encrypt } from "@/lib/crypto";
import { AddressSchema, validateAddressForCountry } from "@/lib/commerce/pricing";
import { failState, fieldErrors, formToObject, okState, zBool, zPassword, zTrimmed, type ActionState } from "@/lib/validation";

const SETUP_COOKIE = "rcc_2fa_setup";

async function guardSensitive() {
  const user = await assertUser();
  if (user.impersonator) throw new AuthError("Security settings can't be changed during a support session", 403);
  return user;
}

function handle(err: unknown): ActionState {
  if (err instanceof AuthError) return failState(err.message);
  throw err;
}

/* --------------------------------------------------------------- profile */

const ProfileSchema = z.object({
  name: zTrimmed(120).min(2, { error: "Enter your name" }),
  phone: zTrimmed(40).optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  timezone: zTrimmed(64).optional(),
  marketingOptIn: zBool.optional(),
  currency: z.string().trim().toUpperCase().length(3).optional(),
  locale: z.string().trim().max(8).optional(),
});

export async function updateProfileAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = ProfileSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const { name, phone, countryCode, timezone, marketingOptIn, currency, locale } = parsed.data;
    const store = await cookies();
    if (currency) {
      const enabled = await db.currency.findFirst({ where: { code: currency, isEnabled: true }, select: { code: true } });
      if (!enabled) return failState("That currency isn't available.", { currency: "Unavailable" });
      store.set(CURRENCY_COOKIE, enabled.code, { path: "/", sameSite: "lax", secure: env.isProd, maxAge: 365 * 86_400 });
    }
    if (locale) {
      const enabled = await db.locale.findFirst({ where: { code: locale, isEnabled: true }, select: { code: true } });
      if (!enabled) return failState("That language isn't available.", { locale: "Unavailable" });
      store.set(LOCALE_COOKIE, enabled.code, { path: "/", sameSite: "lax", secure: env.isProd, maxAge: 365 * 86_400 });
    }
    if (timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return failState("Unknown timezone.", { timezone: "Unknown timezone" });
      }
    }
    await db.user.update({ where: { id: user.id }, data: { name, phone: phone || null, countryCode, timezone, marketingOptIn: marketingOptIn ?? false, ...(currency ? { currency } : {}), ...(locale ? { locale } : {}) } });
    revalidatePath("/account", "layout");
    return okState(undefined, "Profile saved.");
  } catch (err) {
    return handle(err);
  }
}

/* -------------------------------------------------------------- password */

const PasswordSchema = z.object({ current: z.string().min(1), password: zPassword, confirm: z.string() });

export async function changePasswordAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await guardSensitive();
    const parsed = PasswordSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    if (parsed.data.password !== parsed.data.confirm) return failState("Passwords don't match.", { confirm: "Must match" });
    const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(parsed.data.current, record.passwordHash))) return failState("Your current password is incorrect.", { current: "Incorrect" });
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.password) } });
    await revokeAllSessions(user.id, user.session.id);
    await securityEvent("password_changed", user.id);
    return okState(undefined, "Password updated. Other devices have been signed out.");
  } catch (err) {
    return handle(err);
  }
}

/* -------------------------------------------------------------------- 2FA */

export async function beginTwoFactorSetupAction(): Promise<{ ok: true; qr: string; secret: string } | { ok: false; message: string }> {
  try {
    const user = await guardSensitive();
    if (user.twoFactorEnabled) return { ok: false, message: "Two-factor authentication is already enabled." };
    const secret = generateTotpSecret();
    (await cookies()).set(SETUP_COOKIE, encrypt(secret), { httpOnly: true, sameSite: "lax", secure: env.isProd, path: "/", maxAge: 600 });
    return { ok: true, qr: await totpQrDataUrl(secret, user.email), secret };
  } catch (err) {
    return { ok: false, message: err instanceof AuthError ? err.message : "Could not start setup" };
  }
}

export async function enableTwoFactorAction(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; message: string }> {
  try {
    const user = await guardSensitive();
    const store = await cookies();
    const enc = store.get(SETUP_COOKIE)?.value;
    if (!enc) return { ok: false, message: "Setup expired. Start again." };
    const secret = decrypt(enc);
    if (!verifyTotp(secret, code)) return { ok: false, message: "That code isn't valid. Make sure your device clock is correct and try the newest code." };
    const codes = generateRecoveryCodes();
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorSecretEnc: encrypt(secret), recoveryCodesJson: JSON.stringify(codes.map(hashRecoveryCode)) },
    });
    store.delete(SETUP_COOKIE);
    await securityEvent("twofa_enabled", user.id);
    await audit({ actor: { id: user.id, email: user.email, type: user.isAdmin ? "admin" : "user" }, action: "user.2fa.enable", targetType: "user", targetId: user.id, summary: `${user.email} enabled two-factor authentication` });
    revalidatePath("/account/security");
    revalidatePath("/admin", "layout");
    return { ok: true, recoveryCodes: codes };
  } catch (err) {
    return { ok: false, message: err instanceof AuthError ? err.message : "Could not enable two-factor authentication" };
  }
}

const DisableSchema = z.object({ password: z.string().min(1), code: zTrimmed(20) });

export async function disableTwoFactorAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await guardSensitive();
    const parsed = DisableSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Enter your password and a current code.");
    const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, twoFactorSecretEnc: true, roleId: true } });
    if (!(await verifyPassword(parsed.data.password, record.passwordHash))) return failState("Password is incorrect.");
    if (!record.twoFactorSecretEnc || !verifyTotp(decrypt(record.twoFactorSecretEnc), parsed.data.code)) return failState("That code isn't valid.");
    await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, recoveryCodesJson: null } });
    await securityEvent("twofa_disabled", user.id);
    revalidatePath("/account/security");
    return okState(undefined, record.roleId ? "Two-factor authentication disabled. Admin access requires it again before your next sign-in." : "Two-factor authentication disabled.");
  } catch (err) {
    return handle(err);
  }
}

export async function regenerateRecoveryCodesAction(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; message: string }> {
  try {
    const user = await guardSensitive();
    const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorSecretEnc: true } });
    if (!record.twoFactorSecretEnc || !verifyTotp(decrypt(record.twoFactorSecretEnc), code)) return { ok: false, message: "That code isn't valid." };
    const codes = generateRecoveryCodes();
    await db.user.update({ where: { id: user.id }, data: { recoveryCodesJson: JSON.stringify(codes.map(hashRecoveryCode)) } });
    await securityEvent("recovery_codes_regenerated", user.id);
    return { ok: true, recoveryCodes: codes };
  } catch (err) {
    return { ok: false, message: err instanceof AuthError ? err.message : "Could not regenerate codes" };
  }
}

/* --------------------------------------------------------------- sessions */

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  try {
    const user = await guardSensitive();
    await revokeSession(sessionId, user.id);
    await securityEvent("session_revoked", user.id, { sessionId });
    revalidatePath("/account/security");
    return okState(undefined, "Device signed out.");
  } catch (err) {
    return handle(err);
  }
}

export async function revokeOtherSessionsAction(): Promise<ActionState> {
  try {
    const user = await guardSensitive();
    await revokeAllSessions(user.id, user.session.id);
    await securityEvent("session_revoked", user.id, { all: true });
    revalidatePath("/account/security");
    return okState(undefined, "All other devices have been signed out.");
  } catch (err) {
    return handle(err);
  }
}

/* -------------------------------------------------------------- addresses */

const SaveAddressSchema = AddressSchema.extend({
  id: z.string().optional(),
  label: zTrimmed(60).optional(),
  isDefaultShipping: zBool.optional(),
  isDefaultBilling: zBool.optional(),
});

export async function saveAddressAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = SaveAddressSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const { id, label, isDefaultShipping, isDefaultBilling, ...address } = parsed.data;
    const check = await validateAddressForCountry(address);
    if (!check.ok) return failState(check.message, check.field ? { [check.field]: check.message } : undefined);
    const count = await db.address.count({ where: { userId: user.id } });
    if (!id && count >= 20) return failState("You can save up to 20 addresses.");
    const data = { ...address, label: label || null, company: address.company ?? null, line2: address.line2 ?? null, region: address.region ?? null, postalCode: address.postalCode ?? null, phone: address.phone ?? null };
    await db.$transaction(async (tx) => {
      const makeDefaultShipping = isDefaultShipping || count === 0;
      if (makeDefaultShipping) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefaultShipping: false } });
      if (isDefaultBilling) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefaultBilling: false } });
      if (id) {
        const owned = await tx.address.findFirst({ where: { id, userId: user.id } });
        if (!owned) throw new AuthError("Address not found", 403);
        await tx.address.update({ where: { id }, data: { ...data, isDefaultShipping: makeDefaultShipping || owned.isDefaultShipping, isDefaultBilling: isDefaultBilling || owned.isDefaultBilling } });
      } else {
        await tx.address.create({ data: { ...data, userId: user.id, isDefaultShipping: makeDefaultShipping, isDefaultBilling: Boolean(isDefaultBilling) } });
      }
    });
    revalidatePath("/account/addresses");
    return okState(undefined, "Address saved.");
  } catch (err) {
    return handle(err);
  }
}

export async function deleteAddressAction(id: string): Promise<ActionState> {
  try {
    const user = await assertUser();
    await db.address.deleteMany({ where: { id, userId: user.id } });
    revalidatePath("/account/addresses");
    return okState(undefined, "Address removed.");
  } catch (err) {
    return handle(err);
  }
}

/* ----------------------------------------------------------- notifications */

const PrefsSchema = z.object({
  orderUpdates: zBool.optional(),
  sellerAlerts: zBool.optional(),
  supportReplies: zBool.optional(),
  marketing: zBool.optional(),
  productAlerts: zBool.optional(),
});

export async function updateNotificationPrefsAction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const parsed = PrefsSchema.safeParse(formToObject(formData));
    if (!parsed.success) return failState("Could not save preferences.");
    const data = {
      orderUpdates: parsed.data.orderUpdates ?? false,
      sellerAlerts: parsed.data.sellerAlerts ?? false,
      supportReplies: parsed.data.supportReplies ?? false,
      marketing: parsed.data.marketing ?? false,
      productAlerts: parsed.data.productAlerts ?? false,
    };
    await db.notificationPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    await db.user.update({ where: { id: user.id }, data: { marketingOptIn: data.marketing } });
    revalidatePath("/account/notifications");
    return okState(undefined, "Preferences saved.");
  } catch (err) {
    return handle(err);
  }
}

export async function markNotificationsReadAction(ids?: string[]): Promise<void> {
  const user = await assertUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/account/notifications");
}
