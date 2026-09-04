import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import { ADMIN_NAV } from "@/components/admin/nav";
import { hasPermission } from "@/lib/permissions";

export type AdminShellUser = { name: string; email: string; roleName: string; permissions: string[] };

/** Enterprise admin chrome: dark sidebar with permission-filtered navigation, topbar with global search. */
export function AdminShell({ user, unread, children }: { user: AdminShellUser; unread: number; children: ReactNode }) {
  const groups = ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => hasPermission(user.permissions, i.perm)) })).filter((g) => g.items.length > 0);
  return (
    <div className="flex min-h-screen bg-ink-50 text-ink-900">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white">
        Skip to content
      </a>
      <AdminSidebar groups={groups} roleName={user.roleName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar user={user} unread={unread} groups={groups} />
        <main id="admin-main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
