import type { Permission } from "@/lib/permissions";

export type AdminNavItem = { href: string; label: string; perm: Permission; exact?: boolean };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", perm: "dashboard.view", exact: true },
      { href: "/admin/reports", label: "Reports & analytics", perm: "reports.view" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/admin/orders", label: "Orders", perm: "orders.view" },
      { href: "/admin/payments", label: "Payments", perm: "finance.view" },
      { href: "/admin/returns", label: "Returns", perm: "returns.manage" },
      { href: "/admin/disputes", label: "Disputes & chargebacks", perm: "disputes.manage" },
      { href: "/admin/shipping", label: "Shipping", perm: "shipping.manage" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Listings", perm: "products.view" },
      { href: "/admin/catalog", label: "Categories & brands", perm: "catalog.manage" },
      { href: "/admin/reviews", label: "Reviews", perm: "reviews.manage" },
      { href: "/admin/promotions", label: "Promotions", perm: "promotions.manage" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", perm: "users.view" },
      { href: "/admin/sellers", label: "Sellers", perm: "sellers.view" },
      { href: "/admin/finance", label: "Finance & payouts", perm: "finance.view" },
    ],
  },
  {
    label: "Trust & support",
    items: [
      { href: "/admin/support", label: "Support tickets", perm: "support.view" },
      { href: "/admin/moderation", label: "Moderation", perm: "moderation.manage" },
      { href: "/admin/notifications", label: "Notifications & email", perm: "notifications.manage" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/settings", label: "Settings", perm: "settings.view" },
      { href: "/admin/admins", label: "Admins & roles", perm: "admins.manage" },
      { href: "/admin/audit", label: "Audit & security log", perm: "audit.view" },
      { href: "/admin/system", label: "Jobs & webhooks", perm: "system.manage" },
    ],
  },
];
