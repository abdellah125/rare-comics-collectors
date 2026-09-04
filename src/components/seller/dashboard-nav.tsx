"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/listings", label: "Listings" },
  { href: "/dashboard/orders", label: "Orders", badge: "orders" as const },
  { href: "/dashboard/balance", label: "Balance & payouts" },
  { href: "/dashboard/returns", label: "Returns" },
  { href: "/dashboard/disputes", label: "Disputes", badge: "disputes" as const },
  { href: "/dashboard/reviews", label: "Reviews" },
  { href: "/dashboard/performance", label: "Performance" },
  { href: "/dashboard/settings", label: "Store settings" },
];

export function DashboardNav({ storeName, storeSlug, badges }: { storeName: string; storeSlug: string; badges: { orders: number; disputes: number } }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <aside>
      <p className="truncate font-display text-lg font-semibold text-ink-950">{storeName}</p>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">Seller dashboard</p>
      <nav aria-label="Seller dashboard">
        <ul className="grid gap-0.5">
          {ITEMS.map((item) => {
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active(item.href, item.exact) ? "page" : undefined}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active(item.href, item.exact) ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-100"}`}
                >
                  {item.label}
                  {count > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{count}</span>}
                </Link>
              </li>
            );
          })}
          <li className="mt-3 border-t border-ink-200 pt-3">
            <Link href="/dashboard/listings/new" className="block rounded-lg bg-ink-950 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-ink-800">
              + New listing
            </Link>
          </li>
          <li>
            <Link href={`/sellers/${storeSlug}`} className="block rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100">
              View storefront ↗
            </Link>
          </li>
          <li>
            <Link href="/account" className="block rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-100">
              My account
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
