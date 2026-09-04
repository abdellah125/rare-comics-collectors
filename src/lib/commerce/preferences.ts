"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { CURRENCY_COOKIE } from "@/lib/currency";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/session";

export async function setCurrencyAction(code: string): Promise<void> {
  const clean = code.toUpperCase().slice(0, 3);
  const currency = await db.currency.findFirst({ where: { code: clean, isEnabled: true } });
  if (!currency) return;
  (await cookies()).set(CURRENCY_COOKIE, currency.code, { path: "/", sameSite: "lax", secure: env.isProd, maxAge: 365 * 86_400 });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { currency: currency.code } });
}

export async function setLocaleAction(code: string): Promise<void> {
  const locale = await db.locale.findFirst({ where: { code: code.slice(0, 8), isEnabled: true } });
  if (!locale) return;
  (await cookies()).set(LOCALE_COOKIE, locale.code, { path: "/", sameSite: "lax", secure: env.isProd, maxAge: 365 * 86_400 });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale: locale.code } });
}
