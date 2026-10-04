import { describe, expect, it } from "vitest";
import { INVOICE_WHATSAPP, invoiceStatusLabel, isInvoiceRef, parseInvoiceRequest, whatsappChatUrl, whatsappLink } from "@/lib/payments/paypal-invoice";

describe("PayPal invoice request", () => {
  it("accepts complete details and tidies them", () => {
    const r = parseInvoiceRequest({ name: "  Jane   Doe ", paypalEmail: " Jane@Example.COM " });
    expect(r).toEqual({ ok: true, value: { name: "Jane Doe", paypalEmail: "jane@example.com" } });
  });

  it("names the field that is missing or wrong", () => {
    const field = (i: Parameters<typeof parseInvoiceRequest>[0]) => {
      const r = parseInvoiceRequest(i);
      return r.ok ? null : r.field;
    };
    expect(field(undefined)).toBe("invoice.name");
    expect(field({ name: "J", paypalEmail: "j@example.com" })).toBe("invoice.name");
    expect(field({ name: "Jane Doe", paypalEmail: "not-an-email" })).toBe("invoice.paypalEmail");
    // The buyer is never asked for a WhatsApp number: name and PayPal email are enough.
    expect(field({ name: "Jane Doe", paypalEmail: "j@example.com" })).toBeNull();
  });

  it("tells invoice references from PayPal order ids", () => {
    expect(isInvoiceRef("invoice_RCC-10001")).toBe(true);
    expect(isInvoiceRef("5O190127TN364715T")).toBe(false);
    expect(isInvoiceRef(null)).toBe(false);
  });

  it("labels the statuses the way the admin sees them", () => {
    expect(invoiceStatusLabel("requested")).toBe("PayPal Invoice Requested");
    expect(invoiceStatusLabel("pending")).toBe("Invoice Pending");
    expect(invoiceStatusLabel("sent")).toBe("Invoice Sent");
    expect(invoiceStatusLabel("paid")).toBe("Paid");
    expect(invoiceStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("builds WhatsApp links", () => {
    expect(INVOICE_WHATSAPP.url).toBe("https://wa.me/14185066697");
    expect(whatsappChatUrl("Order RCC-1 question")).toBe("https://wa.me/14185066697?text=Order%20RCC-1%20question");
    expect(whatsappLink("+1 (418) 555-0100")).toBe("https://wa.me/14185550100");
    expect(whatsappLink("123")).toBeNull();
  });
});
