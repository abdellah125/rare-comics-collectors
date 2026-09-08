import type { Metadata } from "next";
import { CheckoutOutcome } from "@/components/checkout-outcome";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Order confirmation", description: "Your order status.", path: "/checkout/complete", noIndex: true });
export const dynamic = "force-dynamic";

/** Placed orders only (paid, awaiting a wire, or awaiting the provider); failures redirect to /checkout/failed. */
export default async function CheckoutCompletePage({ searchParams }: PageProps<"/checkout/complete">) {
  const sp = await searchParams;
  const number = typeof sp.order === "string" ? sp.order : "";
  return <CheckoutOutcome number={number} expect="placed" />;
}
