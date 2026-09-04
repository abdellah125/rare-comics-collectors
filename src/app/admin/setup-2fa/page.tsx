import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TwoFactorPanel } from "@/components/account/two-factor";
import { adminAccessState } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

/** Forced 2FA enrolment for admin accounts (security.adminRequire2fa). */
export default async function AdminSetup2faPage() {
  const { user, gate } = await adminAccessState();
  if (gate === "login" || !user) redirect("/admin/login?next=/admin/setup-2fa");
  if (gate === "not_admin" || gate === "suspended") redirect("/admin/login?error=" + gate);
  if (gate === "ok") redirect("/admin");
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <p className="text-center font-logo text-lg font-black uppercase tracking-tight text-brand-600">RCC Admin</p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-ink-950">Two-factor authentication is required</h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-ink-600">Admin access to the marketplace needs an authenticator app on your phone. It takes about a minute.</p>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6 shadow-plate">
          <TwoFactorPanel enabled={false} redirectTo="/admin" />
        </div>
      </div>
    </div>
  );
}
