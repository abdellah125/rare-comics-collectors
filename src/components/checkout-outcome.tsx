import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BankDetails } from "@/components/bank-details";
import { ClearCart } from "@/components/clear-cart";
import { CheckIcon, ClockIcon } from "@/components/icons";
import { PurchaseEvent } from "@/components/purchase-event";
import { Container, buttonSizes, buttonStyles } from "@/components/ui";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hasRecentOrderCookie } from "@/lib/commerce/recent-order";
import { formatMoney } from "@/lib/money";
import { bankTransferDetails } from "@/lib/payments/bank-details";
import { INVOICE_WHATSAPP, holdLabel, whatsappChatUrl } from "@/lib/payments/paypal-invoice";
import { getSettings } from "@/lib/settings";
import { site } from "@/lib/site";

/**
 * Order outcome shown after checkout. Two URLs share it so analytics can count
 * a page visit as a purchase without ambiguity:
 *   /checkout/complete?order=… — placed orders (paid, awaiting a wire or a PayPal invoice, or awaiting the provider)
 *   /checkout/failed?order=…   — declined or cancelled payments
 * Each page redirects to the other when the order's state does not match its URL.
 */
export async function CheckoutOutcome({ number, expect }: { number: string; expect: "placed" | "failed" }) {
  if (!number) redirect("/cart");
  const order = await db.order.findUnique({
    where: { number },
    include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!order) notFound();
  const user = await getCurrentUser();
  const allowed = (user && order.userId === user.id) || (await hasRecentOrderCookie(number));
  if (!allowed) redirect(`/track-order?ref=${encodeURIComponent(number)}`);

  const failed = ["failed", "cancelled"].includes(order.status);
  if (failed && expect === "placed") redirect(`/checkout/failed?order=${encodeURIComponent(number)}`);
  if (!failed && expect === "failed") redirect(`/checkout/complete?order=${encodeURIComponent(number)}`);

  const payment = order.payments[0];
  const settings = await getSettings();
  const paid = order.paymentStatus === "paid";
  const awaiting = order.status === "pending_payment";
  // The failure reason comes from the payment record, never from the URL.
  const message = payment?.failureMessage?.trim() ? `The payment provider said: ${payment.failureMessage.trim()}` : null;
  const bank = payment?.provider === "bank_transfer";
  // PayPal invoice request: never described as paid until staff record the invoice as paid.
  const invoice = order.invoiceStatus != null;
  const invoiceSent = order.invoiceStatus === "sent";
  const invoiceAmount = formatMoney(order.presentmentTotal, order.currency);

  let title = "Payment processing";
  if (failed) title = invoice && !paid ? "Order request cancelled" : "Payment didn’t go through";
  else if (paid) title = "Order placed";
  else if (invoice) title = invoiceSent ? "Your PayPal invoice has been sent" : "Request received — your PayPal invoice is on its way";
  else if (bank) title = "Order reserved — awaiting your transfer";

  let body: string;
  if (failed && invoice && !paid) body = `This PayPal invoice request was cancelled${order.cancelReason ? ` (${order.cancelReason})` : ""}. Nothing was charged and the items have been returned to stock.`;
  else if (failed) body = message ?? "Your card wasn’t charged and the items have been returned to stock. You can try again from your cart.";
  else if (paid) body = `Thank you. A confirmation is on its way to ${order.email}. Books are pulled, photographed and double-boxed within one business day.`;
  else if (invoice && invoiceSent) body = `We sent a PayPal invoice for ${invoiceAmount} to ${order.paypalEmail}. Open it from PayPal’s email or from your PayPal account to pay. Your order is confirmed once the invoice is paid.`;
  else if (invoice) body = `We have received your order and payment request. We will contact you and send a PayPal invoice for ${invoiceAmount} to ${order.paypalEmail}. Nothing has been charged: your order is confirmed once that invoice is paid. Your books are reserved for ${holdLabel(settings["payments.paypal.invoiceHoldHours"])}.`;
  else if (bank) body = `Your books are reserved for ${settings["commerce.autoCancelUnpaidHours"]} hours. Wire the order total using the details below — they are also in your confirmation email.`;
  else body = "We’re waiting for the payment provider to confirm. This page updates once it clears — you’ll also get an email.";

  const paymentLabel = !payment
    ? null
    : payment.provider === "stripe"
      ? `Card${payment.cardLast4 ? ` •••• ${payment.cardLast4}` : ""}`
      : payment.provider === "paypal"
        ? invoice
          ? paid
            ? "PayPal invoice — paid"
            : failed
              ? "PayPal invoice — cancelled"
              : invoiceSent
                ? "PayPal invoice — sent, awaiting payment"
                : "PayPal invoice — not yet paid"
          : "PayPal"
        : payment.provider === "bank_transfer"
          ? "Bank transfer"
          : "Test payment";

  return (
    <Container className="py-12 lg:py-16">
      <ClearCart when={paid || awaiting} />
      {(paid || awaiting) && (
        <PurchaseEvent
          transactionId={order.number}
          value={order.total / 100}
          currency="USD"
          tax={order.taxTotal / 100}
          shipping={order.shippingTotal / 100}
          paymentType={payment?.provider ?? "unknown"}
          items={order.items.map((i) => ({ item_id: i.sku ?? i.slug, item_name: i.subtitle ? `${i.title} — ${i.subtitle}` : i.title, price: i.unitPrice / 100, quantity: i.qty, item_category: i.kind }))}
        />
      )}
      <div className="mx-auto max-w-2xl rounded-2xl border border-ink-200 bg-white p-8 text-center sm:p-12">
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-white ${failed ? "bg-rose-600" : paid ? "bg-brand-600" : "bg-gold-500"}`}>
          {failed ? <span className="text-2xl font-bold">!</span> : paid ? <CheckIcon className="h-7 w-7" /> : <ClockIcon className="h-7 w-7" />}
        </span>
        <h1 className="mt-6 font-display text-2xl font-semibold text-ink-950 sm:text-3xl">{title}</h1>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">{body}</p>
        {invoice && !paid && !failed && (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-gold-400/50 bg-gold-400/10 p-5 text-left" data-testid="invoice-whatsapp">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-800">Questions about your invoice?</p>
            <p className="mt-2 text-sm text-ink-800">
              WhatsApp: <strong className="font-semibold text-ink-950">{INVOICE_WHATSAPP.display}</strong>
            </p>
            <p className="mt-1 text-[13px] text-ink-600">Send us a message directly. Your order number is added for you.</p>
            <a href={whatsappChatUrl(`Hello, I have a question about my PayPal invoice for order ${order.number}.`)} target="_blank" rel="noopener noreferrer" className={`${buttonStyles.primary} ${buttonSizes.md} mt-3 w-full justify-center`}>
              Message us on WhatsApp
            </a>
          </div>
        )}
        {bank && awaiting && (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-gold-400/50 bg-gold-400/10 p-5 text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-800">Wire details</p>
            <div className="mt-2">
              <BankDetails {...(({ lines, note }) => ({ lines, note }))(bankTransferDetails(settings, order.number))} compact />
            </div>
          </div>
        )}

        <dl className="mx-auto mt-7 grid max-w-sm gap-3 rounded-xl border border-ink-200 bg-ink-50 p-5 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">Order number</dt>
            <dd className="font-mono font-semibold text-ink-950">{order.number}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-600">{invoice && !paid ? "Invoice amount" : "Total"}</dt>
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
