import "server-only";
import { env } from "@/lib/env";

/**
 * Read-only check of the Stripe setup: which kind of keys are configured (never the keys themselves),
 * whether the secret or restricted key is accepted, and whether it has the permissions the site uses.
 * Each permission is tested with a harmless list request (limit=1); nothing is created or changed.
 */
export type StripeCheck = { name: string; ok: boolean; detail: string };
export type StripeHealth = { ok: boolean; mode: "live" | "test" | "mismatch" | "missing"; checks: StripeCheck[] };

const kind = (key: string) => (/^sk_/.test(key) ? "secret key" : /^rk_/.test(key) ? "restricted key" : key ? "unrecognised key" : "not set");
const modeOf = (key: string) => (/_live_/.test(key) ? "live" : /_test_/.test(key) ? "test" : null);

async function probe(path: string, key: string): Promise<{ status: number; message: string }> {
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${key}`, "stripe-version": "2024-06-20" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { status: res.status, message: body?.error?.message ?? "" };
  } catch (err) {
    return { status: 0, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function stripeHealth(): Promise<StripeHealth> {
  const secret = env.stripe.secretKey.trim();
  const publishable = env.stripe.publishableKey.trim();
  const webhook = env.stripe.webhookSecret.trim();
  const checks: StripeCheck[] = [
    { name: "Publishable key", ok: /^pk_(live|test)_/.test(publishable), detail: publishable ? `${modeOf(publishable) ?? "?"} mode` : "not set (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)" },
    { name: "Secret or restricted key", ok: /^(sk|rk)_(live|test)_/.test(secret), detail: secret ? `${kind(secret)}, ${modeOf(secret) ?? "?"} mode` : "not set (STRIPE_SECRET_KEY)" },
    { name: "Webhook signing secret", ok: /^whsec_/.test(webhook), detail: webhook ? (/^whsec_/.test(webhook) ? "set" : "set, but it does not start with whsec_") : "not set (STRIPE_WEBHOOK_SECRET)" },
  ];
  const pm = modeOf(publishable);
  const sm = modeOf(secret);
  const mode = !pm || !sm ? "missing" : pm !== sm ? "mismatch" : pm;
  if (mode === "mismatch") checks.push({ name: "Same mode", ok: false, detail: "the publishable key and the secret key are from different modes (live and test)" });

  if (/^(sk|rk)_/.test(secret)) {
    const tests: [string, string][] = [
      ["Payments (PaymentIntents)", "payment_intents?limit=1"],
      ["Card details (Charges)", "charges?limit=1"],
      ["Stripe fees (Balance transactions)", "balance_transactions?limit=1"],
      ["Refunds", "refunds?limit=1"],
    ];
    for (const [name, path] of tests) {
      const r = await probe(path, secret);
      const detail = r.status === 200 ? "allowed" : r.status === 401 ? "the key is not valid (revoked, rolled or mistyped)" : r.status === 403 ? "the key lacks this permission" : r.status === 0 ? `Stripe could not be reached: ${r.message}` : `Stripe answered ${r.status}${r.message ? `: ${r.message}` : ""}`;
      checks.push({ name, ok: r.status === 200, detail });
      if (r.status === 401) break;
    }
  }
  return { ok: checks.every((c) => c.ok), mode, checks };
}
