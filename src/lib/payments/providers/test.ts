import "server-only";
import type { PaymentProvider } from "@/lib/payments/types";

/**
 * Sandbox gateway for automated tests and demos. Enabled only through the
 * "payments.test.enabled" setting; never charges anything.
 * metadata.simulate = "fail" makes the payment fail.
 */
export const testProvider: PaymentProvider = {
  id: "test",
  displayName: "Test payment (sandbox)",
  method: "test",
  isConfigured: () => true,
  async createPayment(input) {
    const ref = `test_${input.orderNumber}_${Date.now()}`;
    if (input.metadata.simulate === "fail") return { kind: "failed", providerRef: ref, message: "Simulated decline" };
    if (input.metadata.simulate === "pending") return { kind: "instructions", providerRef: ref, instructions: "Simulated pending payment." };
    return { kind: "succeeded", providerRef: ref, details: { cardBrand: "test", cardLast4: "4242" } };
  },
  async confirmPayment(providerRef) {
    return { status: "succeeded", providerRef };
  },
  async refund(input) {
    return { status: "succeeded", providerRef: `re_${input.providerRef}_${input.amountMinor}` };
  },
};
