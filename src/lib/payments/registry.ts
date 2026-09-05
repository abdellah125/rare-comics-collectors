import "server-only";
import { env } from "@/lib/env";
import { getSettings, type Settings } from "@/lib/settings";
import { bankTransferProvider } from "@/lib/payments/providers/bank-transfer";
import { paypalProvider } from "@/lib/payments/providers/paypal";
import { stripeProvider } from "@/lib/payments/providers/stripe";
import { testProvider } from "@/lib/payments/providers/test";
import type { PaymentProvider, PaymentProviderId } from "@/lib/payments/types";

const PROVIDERS: Record<PaymentProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  paypal: paypalProvider,
  bank_transfer: bankTransferProvider,
  test: testProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as PaymentProviderId[];

export function getProvider(id: string): PaymentProvider | null {
  return (PROVIDERS as Record<string, PaymentProvider>)[id] ?? null;
}

export type ProviderStatus = {
  id: PaymentProviderId;
  displayName: string;
  method: PaymentProvider["method"];
  configured: boolean;
  enabled: boolean;
  currencies: string[];
  minAmount: number;
  note: string | null;
};

function enabledKey(id: PaymentProviderId): keyof Settings {
  return `payments.${id}.enabled` as keyof Settings;
}

/** Status of every provider for the admin payments screen. */
export async function providerStatuses(): Promise<ProviderStatus[]> {
  const settings = await getSettings();
  return PROVIDER_IDS.map((id) => {
    const p = PROVIDERS[id];
    const currencies = (settings[`payments.${id}.currencies` as keyof Settings] as string[] | undefined) ?? ["USD"];
    let note: string | null = null;
    if (id === "stripe" && !p.isConfigured()) note = "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in the environment.";
    if (id === "paypal" && !p.isConfigured()) note = "Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID in the environment.";
    if (id === "paypal" && p.isConfigured()) note = env.paypal.live ? "Live PayPal environment (PAYPAL_ENV=live)." : "PayPal sandbox — credentials must come from a Sandbox app; set PAYPAL_ENV=live for real payments.";
    if (id === "test") note = env.isProd ? "Sandbox gateway — keep disabled in production." : "Sandbox gateway for local testing; never charges.";
    return {
      id,
      displayName: p.displayName,
      method: p.method,
      configured: p.isConfigured(),
      enabled: Boolean(settings[enabledKey(id)]),
      currencies: id === "test" ? ["*"] : currencies,
      minAmount: id === "bank_transfer" ? settings["payments.bank_transfer.minAmount"] : 0,
      note,
    };
  });
}

/** Providers a buyer may use for a given currency/country/amount at checkout. */
export async function availableProviders(ctx: { currency: string; countryCode: string; amountMinor: number }): Promise<ProviderStatus[]> {
  const all = await providerStatuses();
  return all.filter((p) => {
    if (!p.enabled || !p.configured) return false;
    if (p.id === "test" && env.isProd && process.env.ALLOW_TEST_PAYMENTS !== "true") return false;
    if (!p.currencies.includes("*") && !p.currencies.includes(ctx.currency)) return false;
    if (p.minAmount && ctx.amountMinor < p.minAmount) return false;
    return true;
  });
}
