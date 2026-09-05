"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/account", label: "Overview", exact: true },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/payments", label: "Payments & refunds" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/support", label: "Support tickets" },
  { href: "/account/reviews", label: "My reviews" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
];

export function AccountNav({ isSeller, sellerStatus, isAdmin, name }: { isSeller: boolean; sellerStatus: string | null; isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  // Auth pages render without this chrome (see layout), so the nav only shows on account pages.
  if (/^\/account\/(login|register|reset)/.test(pathname)) return null;
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <aside>
      <p className="truncate font-display text-lg font-semibold text-ink-950">{name}</p>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">My account</p>
      <nav aria-label="Account">
        <ul className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
          {ITEMS.map((item) => (
            <li key={item.href} className="shrink-0 whitespace-nowrap lg:whitespace-normal">
              <Link
                href={item.href}
                aria-current={active(item.href, item.exact) ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active(item.href, item.exact) ? "bg-brand-50 text-brand-800" : "text-ink-700 hover:bg-ink-100"}`}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li className="shrink-0 whitespace-nowrap lg:mt-3 lg:border-t lg:border-ink-200 lg:pt-3">
            {isSeller ? (
              <Link href="/dashboard" className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100">
                Seller dashboard{sellerStatus && sellerStatus !== "approved" ? ` (${sellerStatus})` : ""}
              </Link>
            ) : (
              <Link href="/account/seller" aria-current={active("/account/seller") ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-sm font-semibold ${active("/account/seller") ? "bg-brand-50 text-brand-800" : "text-brand-700 hover:bg-ink-100"}`}>
                Become a seller
              </Link>
            )}
          </li>
          {isAdmin && (
            <li className="shrink-0 whitespace-nowrap">
              <Link href="/admin" className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100">
                Admin panel
              </Link>
            </li>
          )}
        </ul>
      </nav>
    </aside>
  );
}
