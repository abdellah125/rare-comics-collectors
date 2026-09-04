"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminNavGroup } from "@/components/admin/nav";

export function AdminNavList({ groups, onNavigate }: { groups: AdminNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Admin" className="grid gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">{g.label}</p>
          <ul className="mt-1.5 grid gap-0.5">
            {g.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active(item.href, item.exact) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${active(item.href, item.exact) ? "bg-white/10 text-white" : "text-ink-300 hover:bg-white/5 hover:text-white"}`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({ groups, roleName }: { groups: AdminNavGroup[]; roleName: string }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-ink-950 px-3 py-5 lg:flex">
      <Link href="/admin" className="px-3">
        <span className="block font-logo text-[15px] font-black uppercase tracking-tight text-brand-400">RCC Admin</span>
        <span className="block text-[11px] text-ink-400">{roleName}</span>
      </Link>
      <div className="mt-6 flex-1 overflow-y-auto">
        <AdminNavList groups={groups} />
      </div>
      <Link href="/" className="mt-4 rounded-lg px-3 py-2 text-[12px] text-ink-400 hover:bg-white/5 hover:text-white">
        ← View storefront
      </Link>
    </aside>
  );
}
