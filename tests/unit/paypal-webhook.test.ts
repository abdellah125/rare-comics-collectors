import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The provider reads PAYPAL_* through env.ts at call time.
const ORIGINAL_FETCH = globalThis.fetch;

describe("paypal webhook verification", () => {
  beforeEach(() => {
    process.env.PAYPAL_WEBHOOK_ID = "WH-TEST";
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
  });

  it("rejects a body without PayPal transmission headers without calling PayPal", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("should not be called")));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const { paypalProvider } = await import("@/lib/payments/providers/paypal");
    const req = new Request("https://example.test/api/webhooks/paypal", { method: "POST", body: "{}" });
    expect(await paypalProvider.verifyWebhook!(req, "{}")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null instead of throwing when the verification call fails", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("PayPal down"))) as unknown as typeof fetch;
    const { paypalProvider } = await import("@/lib/payments/providers/paypal");
    const headers = { "paypal-transmission-id": "t", "paypal-transmission-sig": "s", "paypal-cert-url": "https://api.paypal.com/cert", "paypal-auth-algo": "SHA256withRSA", "paypal-transmission-time": "2026-01-01T00:00:00Z" };
    const body = JSON.stringify({ id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} });
    const req = new Request("https://example.test/api/webhooks/paypal", { method: "POST", body, headers });
    await expect(paypalProvider.verifyWebhook!(req, body)).resolves.toBeNull();
  });
});
