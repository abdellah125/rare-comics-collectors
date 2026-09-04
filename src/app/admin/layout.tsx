import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell";
import { adminAccessState } from "@/lib/auth/session";
import { unreadCount } from "@/lib/notifications";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin chrome. Access is decided per page (requireAdmin) because layouts do
 * not re-run on client navigation; this layout only chooses whether to draw
 * the shell or the bare canvas used by the sign-in pages.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, gate } = await adminAccessState();
  if (gate !== "ok" || !user) return <div className="flex min-h-screen flex-col bg-ink-50">{children}</div>;
  const unread = await unreadCount(user.id);
  return (
    <AdminShell user={{ name: user.name, email: user.email, roleName: user.role?.name ?? "Admin", permissions: user.permissions }} unread={unread}>
      {children}
    </AdminShell>
  );
}
