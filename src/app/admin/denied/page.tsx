import type { Metadata } from "next";
import Link from "next/link";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Access denied" };

export default async function AdminDeniedPage({ searchParams }: PageProps<"/admin/denied">) {
  const user = await requireAdmin();
  const sp = await searchParams;
  const need = typeof sp.need === "string" ? sp.need : "";
  const label = (PERMISSIONS as Record<string, string>)[need as Permission];
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-brand-700">403</p>
      <h1 className="mt-3 text-2xl font-semibold text-ink-950">You don&apos;t have access to that section</h1>
      <p className="mt-3 text-sm text-ink-600">
        Your role <strong>{user.role?.name}</strong> is missing the permission {label ? <>“{label}”</> : need ? <code>{need}</code> : "required for this page"}. Ask a Super Admin to update your role.
      </p>
      <Link href="/admin" className="mt-6 inline-block text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
        ← Back to the dashboard
      </Link>
    </div>
  );
}
