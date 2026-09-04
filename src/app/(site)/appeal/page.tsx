import type { Metadata } from "next";
import { PublicAppealForm } from "@/components/account/appeal-form";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Appeal a decision", description: "Ask Trust & Safety to review a suspension, ban or restriction on your account.", path: "/appeal", noIndex: true });

export default function AppealPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-14 sm:px-8">
      <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand-600">Trust &amp; Safety</p>
      <h1 className="mt-2 font-display text-3xl font-black text-ink-950">Appeal a decision</h1>
      <p className="mt-3 text-sm text-ink-600">If your account was suspended, banned or restricted and you believe that was a mistake, tell us what happened. A person reviews every appeal, usually within two business days. Signed-in users can also appeal from Account › Security.</p>
      <div className="mt-8 rounded-xl border border-ink-200 bg-white p-6">
        <PublicAppealForm />
      </div>
    </main>
  );
}
