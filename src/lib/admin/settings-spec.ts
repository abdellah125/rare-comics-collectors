import type { SettingKey } from "@/lib/settings";

export type SettingField = { key: SettingKey; label: string; kind: "text" | "textarea" | "number" | "money" | "bool" | "select" | "color"; hint?: string; options?: { value: string; label: string }[]; min?: number; max?: number };
export type SettingGroup = { slug: string; title: string; description: string; fields: SettingField[] };

/** Declarative settings form: every key maps to a typed default in settings.ts and is validated per kind when saved. */
export const SETTING_GROUPS: SettingGroup[] = [
  {
    slug: "general",
    title: "General & branding",
    description: "Name, contact details, homepage copy and the announcement bar. Logo and favicon are uploaded below.",
    fields: [
      { key: "marketplace.name", label: "Marketplace name", kind: "text" },
      { key: "marketplace.tagline", label: "Tagline", kind: "text" },
      { key: "marketplace.supportEmail", label: "Support email", kind: "text" },
      { key: "marketplace.primaryColor", label: "Primary colour", kind: "color" },
      { key: "marketplace.homepageHeadline", label: "Homepage headline", kind: "text", hint: "Blank keeps the default hero." },
      { key: "marketplace.homepageSubheadline", label: "Homepage sub-headline", kind: "textarea" },
      { key: "marketplace.announcementBar", label: "Announcement bar", kind: "text", hint: "Shown above the header on every page when set." },
      { key: "marketplace.defaultCountry", label: "Default country", kind: "text", hint: "ISO code, e.g. US" },
      { key: "marketplace.defaultLocale", label: "Default locale", kind: "text" },
      { key: "marketplace.timezone", label: "Time zone", kind: "text", hint: "IANA name, e.g. America/Chicago" },
    ],
  },
  {
    slug: "commerce",
    title: "Orders & checkout",
    description: "Rules applied at checkout and by the order lifecycle jobs.",
    fields: [
      { key: "commerce.guestCheckout", label: "Allow guest checkout", kind: "bool" },
      { key: "commerce.autoCancelUnpaidHours", label: "Cancel unpaid orders after (hours)", kind: "number", min: 1, max: 720 },
      { key: "commerce.autoCompleteDays", label: "Auto-complete delivered orders after (days)", kind: "number", min: 1, max: 90 },
      { key: "commerce.returnWindowDays", label: "Return window (days)", kind: "number", min: 0, max: 365 },
      { key: "commerce.freeShippingThreshold", label: "Free shipping over", kind: "money", hint: "0 disables the marketplace-wide threshold." },
      { key: "commerce.maxOrderItems", label: "Max items per order", kind: "number", min: 1, max: 500 },
      { key: "commerce.maxOrderValue", label: "Max order value", kind: "money", hint: "0 = no cap." },
      { key: "commerce.reservationMinutes", label: "Stock reservation (minutes)", kind: "number", min: 5, max: 1440, hint: "How long checkout holds stock before payment." },
    ],
  },
  {
    slug: "sellers",
    title: "Sellers & listings",
    description: "Onboarding, verification and listing rules.",
    fields: [
      { key: "sellers.enabled", label: "Accept new seller applications", kind: "bool" },
      { key: "sellers.autoApprove", label: "Auto-approve applications", kind: "bool", hint: "Otherwise an admin reviews each one." },
      { key: "sellers.requireVerification", label: "Require identity verification before payouts", kind: "bool" },
      { key: "sellers.maxActiveListings", label: "Max active listings per seller", kind: "number", min: 1, max: 100000 },
      { key: "listings.requireReview", label: "New listings need admin approval", kind: "bool" },
      { key: "listings.requireImage", label: "Listings need at least one image", kind: "bool" },
      { key: "listings.maxImages", label: "Max images per listing", kind: "number", min: 1, max: 30 },
      { key: "listings.minPrice", label: "Minimum price", kind: "money" },
      { key: "listings.maxPrice", label: "Maximum price", kind: "money" },
    ],
  },
  {
    slug: "buyers",
    title: "Buyers & features",
    description: "Buyer-side rules and feature flags. Turning a feature off hides it everywhere and blocks the related actions server-side.",
    fields: [
      { key: "buyers.allowReviews", label: "Allow product reviews", kind: "bool" },
      { key: "buyers.reviewRequiresPurchase", label: "Only verified purchasers can review", kind: "bool" },
      { key: "features.reviews", label: "Feature: reviews", kind: "bool" },
      { key: "features.coupons", label: "Feature: coupons at checkout", kind: "bool" },
      { key: "features.wishlist", label: "Feature: wishlist", kind: "bool" },
      { key: "features.multiCurrency", label: "Feature: currency switcher", kind: "bool" },
      { key: "features.guestTracking", label: "Feature: guest order tracking", kind: "bool" },
      { key: "features.sellerStorefronts", label: "Feature: public seller storefronts", kind: "bool" },
      { key: "features.disputes", label: "Feature: buyer/seller disputes", kind: "bool" },
    ],
  },
  {
    slug: "notifications",
    title: "Notification rules",
    description: "Which automatic emails and admin alerts fire. Templates are edited under Notifications.",
    fields: [
      { key: "notifications.orderConfirmation", label: "Email order confirmations", kind: "bool" },
      { key: "notifications.shippingUpdates", label: "Email shipping updates", kind: "bool" },
      { key: "notifications.sellerNewOrder", label: "Email sellers on new orders", kind: "bool" },
      { key: "notifications.adminNewSeller", label: "Alert admins on seller applications", kind: "bool" },
      { key: "notifications.adminNewDispute", label: "Alert admins on new disputes", kind: "bool" },
      { key: "notifications.adminNewTicket", label: "Alert admins on new tickets", kind: "bool" },
    ],
  },
  {
    slug: "security",
    title: "Security",
    description: "Session lifetimes, lockout policy and admin hardening. Changes apply to new sessions.",
    fields: [
      { key: "security.adminRequire2fa", label: "Require 2FA for the admin panel", kind: "bool" },
      { key: "security.adminSessionHours", label: "Admin session lifetime (hours)", kind: "number", min: 1, max: 72 },
      { key: "security.adminIdleMinutes", label: "Admin idle timeout (minutes)", kind: "number", min: 5, max: 1440 },
      { key: "security.sessionHoursDefault", label: "User session lifetime (hours)", kind: "number", min: 1, max: 720 },
      { key: "security.sessionDaysRemember", label: "“Remember me” lifetime (days)", kind: "number", min: 1, max: 365 },
      { key: "security.maxFailedLogins", label: "Failed logins before lockout", kind: "number", min: 3, max: 20 },
      { key: "security.lockoutMinutes", label: "Lockout duration (minutes)", kind: "number", min: 1, max: 1440 },
      { key: "security.impersonationMinutes", label: "Impersonation session length (minutes)", kind: "number", min: 5, max: 120 },
    ],
  },
  {
    slug: "system",
    title: "System & maintenance",
    description: "Maintenance mode shows a holding page to everyone except admins. Payments webhooks keep working.",
    fields: [
      { key: "system.maintenanceMode", label: "Maintenance mode", kind: "bool" },
      { key: "system.maintenanceMessage", label: "Maintenance message", kind: "textarea" },
      { key: "system.uploadMaxMb", label: "Max upload size (MB)", kind: "number", min: 1, max: 50 },
      { key: "system.jobsEnabled", label: "Background job worker enabled", kind: "bool" },
      { key: "system.exchangeRatesAuto", label: "Refresh exchange rates automatically", kind: "bool" },
    ],
  },
];

export function settingGroup(slug: string): SettingGroup | undefined {
  return SETTING_GROUPS.find((g) => g.slug === slug);
}
