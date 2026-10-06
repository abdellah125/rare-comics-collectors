import type { Transfer } from "@/lib/crypto-payments/chains/types";

/**
 * The rules that tie a blockchain transfer to an order. Pure functions: no network, no database.
 *
 * Every order in an asset is paid to the same address, so a transfer is recognised by its
 * amount (each open payment is quoted a unique one) and by its time (never older than the
 * payment it is matched to). Nothing the buyer says is trusted: a transaction hash only tells
 * the server where to look, and what it finds there is judged by these same rules.
 */
export type OpenPayment = {
  id: string;
  /** exact amount quoted, including the digits that identify the payment */
  expected: bigint;
  /** the order total converted at the quoted rate, without those digits */
  base: bigint;
  createdMs: number;
};

/** A transfer may predate the payment record by this much (clock differences between servers and chains). */
export const CLOCK_SKEW_MS = 2 * 60_000;
/** Above the quoted amount by more than this share, a human decides. */
const OVERPAY_BPS = BigInt(100);
/** Below the order total, down to this share of it, the payment is recorded as short; below that it is not this order's. */
const SHORT_FLOOR_BPS = BigInt(5_000);
const BPS = BigInt(10_000);

const notOlder = (t: Transfer, p: OpenPayment) => t.timeMs === null || t.timeMs >= p.createdMs - CLOCK_SKEW_MS;

/**
 * Automatic detection: the transfer whose amount is exactly the quoted one, made after the
 * payment was created and not already tied to another payment. The earliest one wins.
 */
export function findExact(transfers: Transfer[], payment: OpenPayment, claimed: ReadonlySet<string>): Transfer | null {
  const hits = transfers.filter((t) => t.amount === payment.expected && notOlder(t, payment) && !claimed.has(t.txHash));
  hits.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));
  return hits[0] ?? null;
}

export type Verdict =
  /** pays this order in full */
  | { kind: "match" }
  /** this order's, but less than the total: staff decide */
  | { kind: "underpaid" }
  /** this order's, but well over the total: staff decide */
  | { kind: "overpaid" }
  | { kind: "reject"; reason: string };

/**
 * A transaction the buyer (or staff) pointed at, after it was read from the chain.
 * `others` are the exact amounts quoted to other open payments in the same asset.
 */
export function judgeSubmitted(transfer: Transfer, payment: OpenPayment, others: readonly bigint[]): Verdict {
  if (!notOlder(transfer, payment)) return { kind: "reject", reason: "That transaction was made before this order was placed." };
  if (transfer.amount === payment.expected) return { kind: "match" };
  // An amount quoted to someone else is theirs, whoever submits the hash first.
  if (others.some((o) => o === transfer.amount)) return { kind: "reject", reason: "That transaction matches a different order." };
  if (transfer.amount >= payment.base) {
    const ceiling = payment.expected + (payment.expected * OVERPAY_BPS) / BPS;
    return transfer.amount <= ceiling ? { kind: "match" } : { kind: "overpaid" };
  }
  if (transfer.amount * BPS >= payment.base * SHORT_FLOOR_BPS) return { kind: "underpaid" };
  return { kind: "reject", reason: "The amount of that transaction does not match this order." };
}

/** Where a payment stands once its transaction is known. */
export function progress(confirmations: number, required: number): "detected" | "confirming" | "confirmed" {
  if (confirmations >= required) return "confirmed";
  return confirmations > 0 ? "confirming" : "detected";
}
