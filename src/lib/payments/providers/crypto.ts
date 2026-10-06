import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { CryptoError, createCryptoPayment, cryptoInstructions } from "@/lib/crypto-payments/service";
import { PaymentProviderError, type PaymentProvider } from "@/lib/payments/types";

/**
 * Pay with cryptocurrency, to the store's own wallets.
 *
 * The buyer picks a coin and a network at checkout; placing the order fixes the exact amount
 * for a limited time and shows the one address that belongs to that coin on that network. The
 * order is marked paid by the server once it has seen the transfer on the blockchain with
 * enough confirmations (src/lib/crypto-payments). There is no gateway and no key: the site
 * only reads public chain data, so a refund is sent by hand from the wallet.
 */
export const cryptoProvider: PaymentProvider = {
  id: "crypto",
  displayName: "Cryptocurrency",
  method: "crypto",
  isConfigured: () => true,
  async createPayment(input) {
    const payment = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true, amount: true } });
    if (!payment) throw new PaymentProviderError("The payment record for this order is missing.");
    try {
      // `amount` is the order total in US cents (the base currency), whatever currency the buyer browsed in.
      const row = await createCryptoPayment({ orderId: input.orderId, paymentId: payment.id, usdCents: payment.amount, coin: input.metadata.coin, network: input.metadata.network });
      return { kind: "instructions", providerRef: `crypto_${row.id}`, instructions: cryptoInstructions(row, `${env.siteUrl}/checkout/complete?order=${input.orderNumber}`) };
    } catch (err) {
      if (err instanceof CryptoError) throw new PaymentProviderError(err.message);
      throw err;
    }
  },
  async refund() {
    return { status: "pending", message: "Crypto refunds are sent by hand from your wallet to an address the buyer confirms. Mark the refund completed once it is sent." };
  },
};
