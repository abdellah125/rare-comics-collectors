import type { Metadata } from "next";
import { CheckoutOutcome } from "@/components/checkout-outcome";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Payment didn’t go through", description: "Your order status.", path: "/checkout/failed", noIndex: true });
export const dynamic = "force-dynamic";

/** Declined or cancelled payments only; anything else redirects to /checkout/complete. */
export default async function CheckoutFailedPage({ searchParams }: PageProps<"/checkout/failed">) {
  const sp = await searchParams;
  const number = typeof sp.order === "string" ? sp.order : "";
  return <CheckoutOutcome number={number} expect="failed" />;
}
