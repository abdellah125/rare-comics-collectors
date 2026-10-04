import { site } from "@/lib/site";
/**
 * PayPal invoice requests. Choosing PayPal at checkout does not charge anything: the buyer leaves
 * the details needed to invoice them, the order waits as "pending payment", and staff send the
 * invoice from PayPal and mark the order paid once it is settled. Pure module (client and server).
 */

/** Payment reference of an invoice request, as opposed to a PayPal API order id. */
export const INVOICE_REF_PREFIX = "invoice_";
export const isInvoiceRef = (ref: string | null | undefined): boolean => Boolean(ref?.startsWith(INVOICE_REF_PREFIX));

export const INVOICE_STATUSES = ["requested", "pending", "sent", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const LABELS: Record<InvoiceStatus, string> = {
  requested: "PayPal Invoice Requested",
  pending: "Invoice Pending",
  sent: "Invoice Sent",
  paid: "Paid",
  cancelled: "Cancelled",
};
const TONES: Record<InvoiceStatus, "warning" | "brand" | "success" | "danger"> = {
  requested: "warning",
  pending: "warning",
  sent: "brand",
  paid: "success",
  cancelled: "danger",
};
const known = (s: string): s is InvoiceStatus => (INVOICE_STATUSES as readonly string[]).includes(s);
export const invoiceStatusLabel = (status: string): string => (known(status) ? LABELS[status] : status);
export const invoiceStatusTone = (status: string) => (known(status) ? TONES[status] : ("warning" as const));

/** The store's own WhatsApp: where buyers message us about their invoice. */
export const INVOICE_WHATSAPP = { display: site.whatsapp.display, url: `https://wa.me/${site.whatsapp.number}` } as const;

/** Opens a WhatsApp chat with the store, with the first message already written. */
export const whatsappChatUrl = (message: string): string => `${INVOICE_WHATSAPP.url}?text=${encodeURIComponent(message)}`;

/** "7 days" for 168, "36 hours" for 36. */
export const holdLabel = (hours: number): string => (hours >= 48 && hours % 24 === 0 ? `${hours / 24} days` : `${hours} hours`);

/** A wa.me link for a number the buyer typed, or null when it has no usable digits. */
export function whatsappLink(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

export type InvoiceRequest = { name: string; paypalEmail: string };
type Parsed = { ok: true; value: InvoiceRequest } | { ok: false; message: string; field: string };

/** Validates what the buyer entered in the PayPal invoice form. */
export function parseInvoiceRequest(input: { name?: string; paypalEmail?: string } | null | undefined): Parsed {
  const name = (input?.name ?? "").replace(/\s+/g, " ").trim();
  const paypalEmail = (input?.paypalEmail ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { ok: false, message: "Enter your full name for the PayPal invoice.", field: "invoice.name" };
  if (paypalEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(paypalEmail)) return { ok: false, message: "Enter the email address of your PayPal account.", field: "invoice.paypalEmail" };
  return { ok: true, value: { name, paypalEmail } };
}
