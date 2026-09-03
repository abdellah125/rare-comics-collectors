"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/listings", label: "My listings" },
  { href: "/dashboard/listings/new", label: "+ Add listing" },
  { href: "/dashboard/orders", label: "Orders" },
  { href: "/dashboard/feedback", label: "Feedback" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/account/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-500" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
        <aside className="mb-8 lg:mb-0">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
            Seller dashboard
          </p>
          <nav aria-label="Dashboard">
            <ul className="grid gap-0.5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? "bg-brand-50 text-brand-800"
                        : "text-ink-700 hover:bg-ink-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        {/* The root layout already provides the page's <main> landmark. */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
