import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TwoFactorForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function AdminVerifyPage({ searchParams }: PageProps<"/admin/login/verify">) {
  const sp = await searchParams;
  if (!(await cookies()).has("rcc_login_challenge")) redirect("/admin/login");
  const next = typeof sp.next === "string" && sp.next.startsWith("/admin") ? sp.next : "/admin";
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-center font-logo text-lg font-black uppercase tracking-tight text-brand-600">RCC Admin</p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-ink-950">Enter your code</h1>
        <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6 shadow-plate">
          <TwoFactorForm next={next} />
        </div>
      </div>
    </div>
  );
}
