import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminInput } from "@/components/admin/ui";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { needsInitialAdmin } from "@/lib/admin/setup";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "First-run setup · Admin", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Check the highlighted requirements and try again.",
  mismatch: "The two passwords do not match.",
  weak: "Use at least 10 characters with a letter and a number.",
  key: "The setup key is wrong.",
  rate: "Too many attempts. Wait a few minutes and try again.",
  exists: "An administrator already exists. Sign in instead.",
  failed: "Something went wrong while creating the account. Try again.",
};

/**
 * Shown only while the database has no super administrator (see src/lib/admin/setup.ts).
 * Lives in its own route group so the admin segment's loading boundary does not apply:
 * notFound() must produce a real 404 status here, not a streamed 200.
 * A plain form posting to /api/admin/setup so it also works from a script.
 */
export default async function AdminSetupPage({ searchParams }: PageProps<"/admin/setup">) {
  if (!(await needsInitialAdmin())) notFound();
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <p className="text-center font-logo text-lg font-black uppercase tracking-tight text-brand-600">RCC Admin</p>
          <h1 className="mt-2 text-center text-2xl font-semibold text-ink-950">Create the first administrator</h1>
          <p className="mt-2 text-center text-sm text-ink-600">This page disappears as soon as the account exists. The account gets every permission and must enrol two-factor authentication at its first sign-in.</p>
          <form method="post" action="/api/admin/setup" className="mt-8 grid gap-4 rounded-xl border border-ink-200 bg-white p-6 shadow-plate">
            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-800">Your name</span>
              <input name="name" required minLength={2} maxLength={120} autoComplete="name" className={adminInput} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-800">Email (your sign-in)</span>
              <input name="email" type="email" required autoComplete="username" className={adminInput} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-800">Password</span>
              <input name="password" type="password" required minLength={10} autoComplete="new-password" className={adminInput} />
              <span className="text-[12px] text-ink-500">At least 10 characters with a letter and a number.</span>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-800">Confirm password</span>
              <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={adminInput} />
            </label>
            {env.adminSetupKey && (
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-ink-800">Setup key</span>
                <input name="setupKey" required className={adminInput} />
                <span className="text-[12px] text-ink-500">The ADMIN_SETUP_KEY value configured for this deployment.</span>
              </label>
            )}
            <div className="hidden" aria-hidden="true">
              <label>
                Website <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <button type="submit" className={`${buttonStyles.dark} ${buttonSizes.lg} w-full`}>
              Create administrator
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
