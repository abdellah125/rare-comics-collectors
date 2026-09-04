import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader, Card, Field, Tone, adminInput, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { updateProviderAction } from "@/lib/admin/actions/finance";
import { env } from "@/lib/env";
import { providerStatuses } from "@/lib/payments/registry";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Payment providers" };
export const dynamic = "force-dynamic";

export default async function AdminPaymentProvidersPage() {
  await requireAdmin("finance.manage");
  const [providers, settings] = await Promise.all([providerStatuses(), getSettings()]);
  return (
    <>
      <AdminPageHeader
        crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Payment providers" }]}
        title="Payment providers"
        lead="Secrets stay in environment variables (never in the database). Toggle availability, currencies and offline instructions here. Webhook endpoints: /api/webhooks/stripe and /api/webhooks/paypal."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {providers.map((p) => (
          <Card key={p.id} title={p.displayName} description={p.note ?? undefined} actions={<span className="flex gap-1">{p.configured ? <Tone tone="success">Configured</Tone> : <Tone tone="danger">Not configured</Tone>}{p.enabled ? <Tone tone="brand">Enabled</Tone> : <Tone tone="neutral">Disabled</Tone>}</span>}>
            <ActionForm action={updateProviderAction} hidden={{ provider: p.id }} submitLabel="Save" variant="outline">
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="enabled" defaultChecked={p.enabled} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Offer at checkout
              </label>
              {p.id !== "test" && (
                <Field label="Currencies (ISO codes)" hint="Buyers paying in other currencies won't see this method.">
                  <input name="currencies" defaultValue={p.currencies.join(", ")} className={adminInput} />
                </Field>
              )}
              {p.id === "bank_transfer" && (
                <>
                  <Field label="Minimum order (cents)">
                    <input name="minAmount" type="number" min={0} defaultValue={settings["payments.bank_transfer.minAmount"]} className={adminInput} />
                  </Field>
                  <Field label="Instructions shown to the buyer">
                    <textarea name="instructions" rows={4} defaultValue={settings["payments.bank_transfer.instructions"]} className={adminTextarea} />
                  </Field>
                </>
              )}
              {p.id === "stripe" && <p className="text-[12px] text-ink-500">Env: STRIPE_SECRET_KEY {env.stripe.secretKey ? "✓" : "✗"} · STRIPE_WEBHOOK_SECRET {env.stripe.webhookSecret ? "✓" : "✗"} · NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY {env.stripe.publishableKey ? "✓" : "✗"}</p>}
              {p.id === "paypal" && <p className="text-[12px] text-ink-500">Env: PAYPAL_CLIENT_ID {env.paypal.clientId ? "✓" : "✗"} · PAYPAL_CLIENT_SECRET {env.paypal.clientSecret ? "✓" : "✗"} · PAYPAL_WEBHOOK_ID {env.paypal.webhookId ? "✓" : "✗"} · mode {env.paypal.live ? "live" : "sandbox"}</p>}
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
