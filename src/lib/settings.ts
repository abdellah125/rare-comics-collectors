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
  "commerce.guestCheckout": true,
  "commerce.autoCancelUnpaidHours": 48,
  "commerce.autoCompleteDays": 14,
  "commerce.returnWindowDays": 14,
  "commerce.freeShippingThreshold": 25000,
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

  // Feature flags
  "features.reviews": true,
  "features.coupons": true,
  "features.multiCurrency": true,
  /** Show prices in the currency of the visitor's country until they pick one. */
  "commerce.autoCurrency": true,
  /** Show the site in the language of the visitor's country until they pick one. */
  "i18n.autoDetect": true,
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
  /** How long a PayPal invoice request holds the stock while the invoice is sent and paid. */
  "payments.paypal.invoiceHoldHours": 168,
  "payments.crypto.enabled": true,
  /** How long a quoted crypto amount is held at its rate (10–60). */
  "payments.crypto.quoteMinutes": 30,
  "payments.bank_transfer.enabled": true,
  "payments.bank_transfer.minAmount": 500_000,
  // Bank wire details: entered under Finance › Payment providers; BANK_* environment
  // variables act as defaults until something is saved there.
  "payments.bank_transfer.beneficiary": process.env.BANK_BENEFICIARY ?? "",
  "payments.bank_transfer.bankName": process.env.BANK_NAME ?? "",
  "payments.bank_transfer.accountType": process.env.BANK_ACCOUNT_TYPE ?? "",
  "payments.bank_transfer.accountNumber": process.env.BANK_ACCOUNT_NUMBER ?? "",
  "payments.bank_transfer.routingNumber": process.env.BANK_ROUTING_NUMBER ?? "",
  "payments.bank_transfer.swift": process.env.BANK_SWIFT ?? "",
  "payments.bank_transfer.iban": process.env.BANK_IBAN ?? "",
  "payments.bank_transfer.instructions":
    "Put your order number in the payment reference. Books ship once the funds clear, usually 1–2 business days for domestic wires and 3–5 for international. Your bank's wire fees are not deducted from the order total.",
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
  "catalog.releasePaused": false,
  /** Legacy scheduled publishing of queued imports. Off: imported products go live only when an admin releases them. */
  "catalog.autoRelease": false,
  /** Imported products: selling price = source price × (1 − discount). 2500 = 25 % below the source price. */
  "imports.discountBps": 2500,
  /** When the source price changes, also replace a selling price an admin set by hand. */
  "imports.autoPriceSync": false,
  /** Daily release rule: how many imported products go live per day (UTC) without a manual Release. 0 = off. */
  "imports.autoReleasePerDay": 1000,
  /** true: the rule also takes products still in Pending Review; false: only products an admin approved. */
  "imports.autoReleaseIncludePending": true,
  /** Kept for a person: possible duplicates. */
  "imports.autoReleaseHoldDuplicates": true,
  /** The authorised data feed (https address given by the source). Empty = sync by file upload only. */
  "imports.feedUrl": "",
  /** The feed lists everything currently for sale, so a product missing from it is no longer available. */
  "imports.feedIsComplete": false,
  "imports.syncHours": 24,
  // Content pipeline (Guides / News / Stories). Keys stay in the environment; these are editorial dials.
  "content.enabled": true,
  /** Most articles planned per day. Fewer are written when fewer topics qualify. */
  "content.dailyTarget": 100,
  /** Start small: 10 on the first day, then 25, 50, and the full target from the fourth day. */
  "content.rampUp": true,
  /** Opportunity score (0–100) a topic needs before it is written. */
  "content.minScore": 45,
  "content.newsPerDay": 4,
  /** Only write a topic whose keyword has a measured search volume or Search Console impressions. */
  "content.requireDemand": true,
  /** Publish articles that pass the quality gate and the fact check without waiting for a person. */
  "content.autoPublish": true,
  /** Quality score (0–100) an article needs to be published automatically. */
  "content.minQuality": 75,
  /** News reported by one outlet only (no official source) is held for review unless this is on. */
  "content.publishReportedNews": false,
  "seo.openseoProjectId": "",
  "seo.openseoReserveCredits": 100,
  "seo.autoSync": true,
  "seo.semrushDatabase": "us",
  "seo.semrushDailyUnits": 2000,
  "seo.semrushReserveUnits": 500,
  "seo.semrushCacheDays": 30,
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
