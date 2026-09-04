/**
 * Granular admin permissions. A Role stores a JSON array of these keys; "*"
 * grants everything (Super Admin). Checks always happen on the server via
 * `requireAdmin(permission)` in the auth DAL — the UI only uses them to hide
 * navigation it knows the current admin cannot use.
 */
export const PERMISSIONS = {
  "dashboard.view": "View the admin dashboard",
  "users.view": "View users",
  "users.manage": "Edit, suspend, ban and reactivate users",
  "users.impersonate": "Start audited support sessions as a user",
  "sellers.view": "View sellers and applications",
  "sellers.manage": "Approve, reject, verify and suspend sellers",
  "products.view": "View listings",
  "products.manage": "Create, edit, moderate and delete listings",
  "catalog.manage": "Manage categories and brands",
  "orders.view": "View orders",
  "orders.manage": "Edit, cancel and fulfil orders",
  "orders.refund": "Issue refunds",
  "finance.view": "View transactions, balances and revenue",
  "finance.manage": "Configure payments, currencies, taxes and fees",
  "payouts.manage": "Create, approve and mark seller payouts",
  "shipping.manage": "Manage zones, methods and carriers",
  "returns.manage": "Handle return requests",
  "disputes.manage": "Handle disputes and chargebacks",
  "reviews.manage": "Moderate reviews",
  "moderation.manage": "Handle reports, violations and appeals",
  "promotions.manage": "Manage coupons, campaigns and featured listings",
  "notifications.manage": "Manage templates, announcements and broadcasts",
  "support.view": "View support tickets",
  "support.manage": "Reply to, assign and resolve tickets",
  "settings.view": "View marketplace settings",
  "settings.manage": "Change marketplace settings and feature flags",
  "admins.manage": "Manage admin accounts and roles",
  "audit.view": "View audit and security logs",
  "reports.view": "View analytics and reports",
  "reports.export": "Export reports as CSV",
  "system.manage": "Jobs, webhooks and maintenance mode",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; keys: Permission[] }[] = [
  { label: "Overview", keys: ["dashboard.view", "reports.view", "reports.export", "audit.view"] },
  { label: "People", keys: ["users.view", "users.manage", "users.impersonate", "sellers.view", "sellers.manage", "admins.manage"] },
  { label: "Catalog", keys: ["products.view", "products.manage", "catalog.manage", "promotions.manage", "reviews.manage"] },
  { label: "Commerce", keys: ["orders.view", "orders.manage", "orders.refund", "returns.manage", "disputes.manage", "shipping.manage"] },
  { label: "Finance", keys: ["finance.view", "finance.manage", "payouts.manage"] },
  { label: "Trust & support", keys: ["moderation.manage", "support.view", "support.manage", "notifications.manage"] },
  { label: "Platform", keys: ["settings.view", "settings.manage", "system.manage"] },
];

export const DEFAULT_ROLES: { slug: string; name: string; description: string; permissions: (Permission | "*")[] }[] = [
  { slug: "super_admin", name: "Super Admin", description: "Unrestricted access, including admin and role management.", permissions: ["*"] },
  {
    slug: "admin",
    name: "Admin",
    description: "Full operational control, but cannot manage other admins or roles.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "admins.manage"),
  },
  {
    slug: "moderator",
    name: "Moderator",
    description: "Listing moderation, reviews, reports and seller/user visibility.",
    permissions: ["dashboard.view", "products.view", "products.manage", "catalog.manage", "reviews.manage", "moderation.manage", "users.view", "sellers.view", "reports.view"],
  },
  {
    slug: "support",
    name: "Support",
    description: "Customer and seller support: tickets, orders, returns, disputes and audited impersonation.",
    permissions: ["dashboard.view", "users.view", "users.impersonate", "sellers.view", "products.view", "orders.view", "orders.manage", "returns.manage", "disputes.manage", "support.view", "support.manage", "notifications.manage"],
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Payments, refunds, payouts, balances and financial reports.",
    permissions: ["dashboard.view", "users.view", "sellers.view", "orders.view", "orders.refund", "finance.view", "finance.manage", "payouts.manage", "disputes.manage", "reports.view", "reports.export"],
  },
];

export function hasPermission(granted: readonly string[] | null | undefined, permission: Permission): boolean {
  if (!granted) return false;
  return granted.includes("*") || granted.includes(permission);
}

export function isAdminPermissionSet(granted: readonly string[] | null | undefined): boolean {
  return Boolean(granted && granted.length > 0);
}
