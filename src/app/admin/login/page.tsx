import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/login-form";
import { needsInitialAdmin } from "@/lib/admin/setup";
import { adminAccessState } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const { gate } = await adminAccessState();
  const next = typeof sp.next === "string" && sp.next.startsWith("/admin") ? sp.next : "/admin";
  if (gate === "ok") redirect(next);
  if (gate === "setup_2fa") redirect("/admin/setup-2fa");
  if (await needsInitialAdmin()) redirect("/admin/setup");
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-center font-logo text-lg font-black uppercase tracking-tight text-brand-600">RCC Admin</p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-ink-950">Marketplace administration</h1>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6 shadow-plate">
          {sp.setup === "done" && (
            <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Administrator created. Sign in below, then enrol two-factor authentication.
            </p>
          )}
          <AdminLoginForm next={next} error={typeof sp.error === "string" ? sp.error : null} />
        </div>
      </div>
    </div>
  );
}
