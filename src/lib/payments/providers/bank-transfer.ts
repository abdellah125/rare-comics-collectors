import "server-only";
import type { PaymentProvider } from "@/lib/payments/types";
import { getSettings } from "@/lib/settings";

/**
 * Offline payment: the order is reserved and the buyer wires the money.
 * Finance marks the payment received in the admin, which triggers the normal
 * paid workflow. Refunds are recorded as pending until finance confirms the
 * money was returned.
 */
export const bankTransferProvider: PaymentProvider = {
  id: "bank_transfer",
  displayName: "Bank wire / ACH",
  method: "bank_transfer",
  isConfigured: () => true,
  async createPayment(input) {
    const settings = await getSettings();
    return {
      kind: "instructions",
      providerRef: `wire_${input.orderNumber}`,
      instructions: settings["payments.bank_transfer.instructions"],
    };
  },
  async refund() {
    return { status: "pending", message: "Manual bank refund — mark as completed once the transfer is sent." };
  },
};
