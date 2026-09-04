import { redirect } from "next/navigation";
import { confirmReturn } from "@/lib/commerce/checkout";
import { rememberRecentOrder } from "@/lib/commerce/actions";

export const dynamic = "force-dynamic";

/** Buyers land here after Stripe / PayPal; the payment is verified server-side before anything is shown. */
export default async function CheckoutReturnPage({ searchParams }: PageProps<"/checkout/return">) {
  const sp = await searchParams;
  const order = typeof sp.order === "string" ? sp.order : "";
  const provider = typeof sp.provider === "string" ? sp.provider : "";
  if (!order || !provider) redirect("/cart");
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") params[k] = v;
  const result = await confirmReturn(order, provider, params);
  await rememberRecentOrder(order);
  redirect(`/checkout/complete?order=${encodeURIComponent(order)}&result=${result.status}${result.message ? `&message=${encodeURIComponent(result.message)}` : ""}`);
}
