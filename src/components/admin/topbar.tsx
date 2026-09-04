"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AdminNavGroup } from "@/components/admin/nav";
import { AdminNavList } from "@/components/admin/sidebar";
import type { AdminShellUser } from "@/components/admin/shell";
import { CloseIcon, MenuIcon, SearchIcon } from "@/components/icons";
import { logoutAction } from "@/lib/auth/actions";

export function AdminTopbar({ user, unread, groups }: { user: AdminShellUser; unread: number; groups: AdminNavGroup[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [pending, start] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("admin-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden" aria-label={navOpen ? "Close navigation" : "Open navigation"} aria-expanded={navOpen} aria-controls="admin-mobile-nav" onClick={() => setNavOpen((o) => !o)}>
          {navOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
        <form action="/admin/search" method="get" className="relative min-w-0 flex-1 max-w-xl" role="search">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input id="admin-search" name="q" type="search" defaultValue={params.get("q") ?? ""} placeholder="Search orders, users, listings, tickets…  (Ctrl+K)" aria-label="Global search" className="h-9 w-full rounded-lg border border-ink-200 bg-ink-50 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/account/notifications" className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <span aria-hidden className="text-lg">🔔</span>
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-ink-800 hover:bg-ink-100" aria-expanded={menuOpen} aria-haspopup="menu" aria-controls="admin-user-menu">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{user.name.slice(0, 2).toUpperCase()}</span>
              <span className="hidden sm:block">{user.name}</span>
            </button>
            {menuOpen && (
              <div id="admin-user-menu" role="menu" className="absolute right-0 top-11 w-56 rounded-xl border border-ink-200 bg-white py-1 shadow-lg">
                <p className="truncate px-4 py-2 text-xs text-ink-500">
                  {user.email}
                  <span className="block font-semibold text-ink-800">{user.roleName}</span>
                </p>
                <hr className="my-1 border-ink-100" />
                <Link role="menuitem" href="/account/security" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">
                  Security & 2FA
                </Link>
                <Link role="menuitem" href="/" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">
                  View storefront
                </Link>
                <hr className="my-1 border-ink-100" />
                <button
                  role="menuitem"
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await logoutAction();
                      router.push("/admin/login");
                      router.refresh();
                    })
                  }
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {navOpen && (
        <div id="admin-mobile-nav" className="border-t border-white/10 bg-ink-950 px-3 py-4 lg:hidden">
          <AdminNavList groups={groups} onNavigate={() => setNavOpen(false)} />
        </div>
      )}
    </header>
  );
}
