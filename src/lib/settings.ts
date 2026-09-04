import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Marketplace configuration. Every key has a default so the site works with an
 * empty Setting table; admins override values through /admin/settings and the
 * overrides are stored as JSON text rows.
 */
export const settingDefaults = {
  // Branding & content
  "marketplace.name": "Rare Comics Collectors",
  "marketplace.tagline": "Acquire legends. Grade yours. Know what it's worth.",
  "marketplace.supportEmail": "support@rarecomicscollectors.com",
  "marketplace.logoMediaId": "",
  "marketplace.faviconMediaId": "",
  "marketplace.primaryColor": "#e11d48",
  "marketplace.homepageHeadline": "",
  "marketplace.homepageSubheadline": "",
  "marketplace.announcementBar": "",
  "marketplace.baseCurrency": "USD",
  "marketplace.defaultCountry": "US",
  "marketplace.defaultLocale": "en",
  "marketplace.timezone": "America/Chicago",

  // Commerce rules
  "commerce.commissionBps": 1000,
  "commerce.buyerFeeBps": 0,
  "commerce.guestCheckout": true,
  "commerce.autoCancelUnpaidHours": 48,
  "commerce.autoCompleteDays": 14,
  "commerce.returnWindowDays": 14,
  "commerce.freeShippingThreshold": 25000,
  "commerce.taxMode": "exclusive" as "exclusive" | "inclusive",
  "commerce.maxOrderItems": 25,
  "commerce.maxOrderValue": 0,
  "commerce.reservationMinutes": 30,

  // Payouts
  "payouts.schedule": "weekly" as "manual" | "weekly" | "biweekly" | "monthly",
  "payouts.minAmount": 5000,
  "payouts.holdDays": 7,

  // Sellers & listings
  "sellers.enabled": true,
  "sellers.autoApprove": false,
  "sellers.requireVerification": true,
  "sellers.maxActiveListings": 500,
  "listings.requireReview": true,
  "listings.maxImages": 8,
  "listings.minPrice": 100,
  "listings.maxPrice": 500_000_000,
  "listings.requireImage": true,

  // Buyers
  "buyers.allowReviews": true,
  "buyers.reviewRequiresPurchase": true,

  // Feature flags
  "features.reviews": true,
  "features.coupons": true,
  "features.wishlist": true,
  "features.multiCurrency": true,
  "features.guestTracking": true,
  "features.sellerStorefronts": true,
  "features.disputes": true,

  // Notifications
  "notifications.orderConfirmation": true,
  "notifications.shippingUpdates": true,
  "notifications.sellerNewOrder": true,
  "notifications.adminNewSeller": true,
  "notifications.adminNewDispute": true,
  "notifications.adminNewTicket": true,

  // Payment providers (secrets stay in env; these are operational toggles)
  "payments.test.enabled": false,
  "payments.stripe.enabled": true,
  "payments.paypal.enabled": true,
  "payments.bank_transfer.enabled": true,
  "payments.bank_transfer.minAmount": 500_000,
  "payments.bank_transfer.instructions":
    "Wire the order total to Rare Comics Collectors, LLC. Bank details are included in the invoice email. Books ship once funds clear (usually 1–2 business days).",
  "payments.stripe.currencies": ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"] as string[],
  "payments.paypal.currencies": ["USD", "EUR", "GBP", "CAD", "AUD"] as string[],
  "payments.bank_transfer.currencies": ["USD"] as string[],

  // Security
  "security.adminRequire2fa": true,
  "security.sessionDaysRemember": 30,
  "security.sessionHoursDefault": 24,
  "security.adminSessionHours": 12,
  "security.adminIdleMinutes": 120,
  "security.maxFailedLogins": 5,
  "security.lockoutMinutes": 15,
  "security.impersonationMinutes": 30,

  // System
  "system.maintenanceMode": false,
  "system.maintenanceMessage": "We're doing some maintenance. Back in a few minutes.",
  "system.uploadMaxMb": 8,
  "system.jobsEnabled": true,
  "system.exchangeRatesAuto": true,
};

export type Settings = typeof settingDefaults;
export type SettingKey = keyof Settings;

export const SETTING_KEYS = Object.keys(settingDefaults) as SettingKey[];

function coerce<K extends SettingKey>(key: K, raw: string): Settings[K] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const def = settingDefaults[key];
    if (typeof def === "number") return (typeof parsed === "number" ? parsed : Number(parsed)) as Settings[K];
    if (typeof def === "boolean") return (parsed === true || parsed === "true") as Settings[K];
    if (Array.isArray(def)) return (Array.isArray(parsed) ? parsed : def) as Settings[K];
    return (typeof parsed === "string" ? parsed : String(parsed ?? "")) as Settings[K];
  } catch {
    return settingDefaults[key];
  }
}

/** Every setting, defaults merged with stored overrides. Memoised per request. */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.setting.findMany();
  const merged: Settings = { ...settingDefaults };
  for (const row of rows) {
    if (row.key in settingDefaults) {
      const key = row.key as SettingKey;
      (merged as Record<string, unknown>)[key] = coerce(key, row.value);
    }
  }
  return merged;
});

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

export async function saveSettings(patch: Partial<Settings>, updatedById?: string | null) {
  const entries = Object.entries(patch).filter(([k]) => k in settingDefaults);
  await db.$transaction(
    entries.map(([key, value]) =>
      db.setting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(value), updatedById: updatedById ?? null },
        update: { value: JSON.stringify(value), updatedById: updatedById ?? null },
      }),
    ),
  );
}

/** Commission rate for a seller (basis points), honouring the per-seller override. */
export async function commissionBpsFor(sellerOverride: number | null | undefined): Promise<number> {
  if (typeof sellerOverride === "number") return sellerOverride;
  return (await getSettings())["commerce.commissionBps"];
}
