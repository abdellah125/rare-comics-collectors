import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ClearCart } from "@/components/clear-cart";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { Container, buttonSizes, buttonStyles } from "@/components/ui";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { verifySignedValue } from "@/lib/crypto";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({ title: "Order confirmation", description: "Your order status.", path: "/checkout/complete", noIndex: true });
export const dynamic = "force-dynamic";

export default async function CheckoutCompletePage({ searchParams }: PageProps<"/checkout/complete">) {
  const sp = await searchParams;
  const number = typeof sp.order === "string" ? sp.order : "";
  if (!number) redirect("/cart");
  const order = await db.order.findUnique({
    where: { number },
    include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order) notFound();
  const user = await getCurrentUser();
  const cookieValue = (await cookies()).get(`rcc_o_${number}`)?.value ?? "";
  const allowed = (user && order.userId === user.id) || verifySignedValue(cookieValue) === number;
  if (!allowed) redirect(`/track-order?ref=${encodeURIComponent(number)}`);

  const payment = order.payments[0];
  const settings = await getSettings();
  const paid = order.paymentStatus === "paid";
  const awaiting = order.status === "pending_payment";
  const failed = ["failed", "cancelled"].includes(order.status);
  const message = typeof sp.message === "string" ? sp.message : null;
  const bank = payment?.provider === "bank_transfer";

  let title = "Payment processing";
  if (failed) title = "Payment didn’t go through";
  else if (paid) title = "Order placed";
  else if (bank) title = "Order reserved — awaiting your transfer";

  let body: string;
  if (failed) body = message ?? "Your card wasn’t charged and the items have been returned to stock. You can try again from your cart.";
  else if (paid) body = `Thank you. A confirmation is on its way to ${order.email}. Books are pulled, photographed and double-boxed within one business day.`;
  else if (bank) body = settings["payments.bank_transfer.instructions"];
  else body = "We’re waiting for the payment provider to confirm. This page updates once it clears — you’ll also get an email.";

  const paymentLabel = !payment
    ? null
    : payment.provider === "stripe"
      ? `Card${payment.cardLast4 ? ` •••• ${payment.cardLast4}` : ""}`
      : payment.provider === "paypal"
        ? "PayPal"
        : payment.provider === "bank_transfer"
          ? "Bank transfer"
          : "Test payment";

  return (
    <Container className="py-12 lg:py-16">
      <ClearCart when={paid || awaiting} />
      <div className="mx-auto max-w-2xl rounded-2xl border border-ink-200 bg-white p-8 text-center sm:p-12">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-white ${failed ? "bg-rose-600" : paid ? "bg-brand-600" : "bg-gold-500"}`}>
          {failed ? <span className="text-2xl font-bold">!</span> : paid ? <CheckIcon className="h-7 w-7" /> : <ClockIcon className="h-7 w-7" />}
        </span>
        <h1 className="mt-6 font-display text-2xl font-semibold text-ink-950 sm:text-3xl">{title}</h1>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{body}</p>

        <dl className="mx-auto mt-7 grid max-w-sm gap-3 rounded-xl border border-ink-200 bg-ink-50 p-5 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Order number</dt>
            <dd className="font-mono font-semibold text-ink-950">{order.number}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Total</dt>
            <dd className="font-semibold tabular-nums text-ink-950">{formatMoney(order.presentmentTotal, order.currency)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Items</dt>
            <dd className="text-right text-ink-900">{order.items.map((i) => `${i.title} × ${i.qty}`).join(", ")}</dd>
          </div>
          {paymentLabel && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-600">Payment</dt>
              <dd className="text-ink-900">{paymentLabel}</dd>
            </div>
          )}
        </dl>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {failed ? (
            <Link href="/cart" className={`${buttonStyles.primary} ${buttonSizes.md}`}>
              Back to cart
            </Link>
          ) : (
            <Link href={user ? `/account/orders/${order.number}` : `/track-order?ref=${order.number}`} className={`${buttonStyles.primary} ${buttonSizes.md}`}>
              {user ? "View order" : "Track this order"}
            </Link>
          )}
          <Link href="/store" className={`${buttonStyles.outline} ${buttonSizes.md}`}>
            Keep shopping
          </Link>
        </div>
        <p className="mt-6 text-[13px] text-ink-600">
          Need help?{" "}
          <Link href="/support" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Contact support
          </Link>{" "}
          or call {site.phoneDisplay}.{!user && " Save your order number — you’ll need it to track without an account."}
        </p>
      </div>
    </Container>
  );
}
