import "server-only";
import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import type { CryptoPayment } from "@prisma/client";
import { db } from "@/lib/db";
import { allAssets, assetKey, CRYPTO, getAsset, isTxHash, normalizeTxHash, paymentUri, type CoinId, type CryptoAsset } from "@/lib/crypto-payments/assets";
import { baseAtomic, groupDecimal, payDecimal, receivedDecimal, withTag } from "@/lib/crypto-payments/amounts";
import { detectsAutomatically, listIncoming, lookupTransfer, type Transfer } from "@/lib/crypto-payments/chains";
import { findExact, judgeSubmitted, progress, type OpenPayment } from "@/lib/crypto-payments/match";
import { getRate, getRates } from "@/lib/crypto-payments/rates";
import { formatMoney } from "@/lib/money";
import { notifyAdmins } from "@/lib/notifications";
import { addOrderEvent, type ActorRef } from "@/lib/orders/lifecycle";
import { applyPaymentSuccess } from "@/lib/payments/payment-service";
import { getSettings } from "@/lib/settings";

/**
 * Crypto payments: quoting an amount, watching the blockchain for it and settling the order.
 *
 *   waiting → detected → confirming → paid
 *
 * plus three states that stop short of paid: `expired` (the quote lapsed with nothing seen; the
 * buyer can ask for a new one), and `underpaid` / `review` (money arrived but a person has to
 * decide: wrong amount, after the quote lapsed, or after the order was cancelled).
 *
 * An order becomes paid only here, from what the chain itself reports, after the confirmations
 * the asset requires. Nothing the buyer clicks or types can do it.
 */
export const OPEN_STATUSES = ["waiting", "detected", "confirming"] as const;
/** A transfer inside the quote window, give or take this, is honoured at the quoted rate. */
const LOCK_GRACE_MS = 15 * 60_000;
/** How long after a quote lapses the chain is still watched for a late payment. */
const WATCH_AFTER_EXPIRY_MS = 24 * 3_600_000;
/** How long an order stays reserved after its quote lapses, so the buyer can ask for a new one. */
export const REQUOTE_WINDOW_MS = 30 * 60_000;
/** A transaction that was seen unconfirmed and then vanished (replaced, dropped) is let go after this. */
const VANISHED_AFTER_MS = 2 * 3_600_000;
const MIN_CHECK_GAP_MS: Record<string, number> = { litecoin: 40_000 };
const DEFAULT_CHECK_GAP_MS = 12_000;

export class CryptoError extends Error {}

const big = (s: string | null | undefined) => BigInt(s ?? "0");
const assetOf = (p: Pick<CryptoPayment, "coin" | "network">) => getAsset(p.coin, p.network);
const openOf = (p: CryptoPayment): OpenPayment => ({ id: p.id, expected: big(p.expectedAtomic), base: big(p.baseAtomic), createdMs: p.createdAt.getTime() });

/* ------------------------------------------------------------------ quoting */

export type CryptoOption = {
  coin: CoinId;
  coinName: string;
  network: string;
  networkLabel: string;
  networkShort: string;
  note: string | null;
  /** approximate amount at the current rate, e.g. "0.014443"; the exact amount is fixed when the order is placed */
  estimate: string;
  /** false: the buyer will be asked for the transaction hash after sending */
  automatic: boolean;
};

/** What the checkout can offer for an order of `usdCents`. A coin without a trustworthy price is left out, never replaced. */
export async function cryptoOptions(usdCents: number): Promise<CryptoOption[]> {
  if (usdCents <= 0) return [];
  const rates = await getRates();
  const out: CryptoOption[] = [];
  for (const asset of allAssets()) {
    const rate = rates[asset.coin];
    if (!rate) continue;
    out.push({
      coin: asset.coin,
      coinName: CRYPTO[asset.coin].name,
      network: asset.network,
      networkLabel: asset.networkLabel,
      networkShort: asset.networkShort,
      note: asset.note ?? null,
      estimate: groupDecimal(payDecimal(baseAtomic(usdCents, rate.usd, asset), asset).slice(0, -2)),
      automatic: detectsAutomatically(asset),
    });
  }
  return out;
}

/** Amounts already quoted to other payments in this asset that could still be paid. */
async function amountsInUse(asset: CryptoAsset, exceptId?: string): Promise<Set<string>> {
  const rows = await db.cryptoPayment.findMany({
    where: { coin: asset.coin, network: asset.network, id: exceptId ? { not: exceptId } : undefined, OR: [{ status: { in: [...OPEN_STATUSES] } }, { status: "expired", expiresAt: { gte: new Date(Date.now() - WATCH_AFTER_EXPIRY_MS) } }] },
    select: { expectedAtomic: true },
  });
  return new Set(rows.map((r) => r.expectedAtomic));
}

async function lockAmount(asset: CryptoAsset, usdCents: number, exceptId?: string) {
  const rate = await getRate(asset.coin);
  if (!rate) throw new CryptoError(`A reliable ${asset.coin} price is not available right now. Please try again in a minute or choose another payment method.`);
  const base = baseAtomic(usdCents, rate.usd, asset);
  const used = await amountsInUse(asset, exceptId);
  // 99 tags per converted total: orders of the very same amount in the same coin within a day.
  const tags = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = tags.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [tags[i], tags[j]] = [tags[j], tags[i]];
  }
  const tag = tags.find((t) => !used.has(withTag(base, t, asset).toString()));
  if (tag === undefined) throw new CryptoError(`Too many ${asset.coin} payments for this exact amount are open. Please try again shortly or choose another network.`);
  const expected = withTag(base, tag, asset);
  return { rate, base, expected, display: payDecimal(expected, asset) };
}

/** Creates the payment record with a locked amount. The coin and network are validated here again: no fallback. */
export async function createCryptoPayment(input: { orderId: string; paymentId: string; usdCents: number; coin: unknown; network: unknown }): Promise<CryptoPayment> {
  const asset = getAsset(input.coin, input.network);
  if (!asset) throw new CryptoError("That coin and network are not available.");
  const settings = await getSettings();
  const lock = await lockAmount(asset, input.usdCents);
  return db.cryptoPayment.create({
    data: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      coin: asset.coin,
      network: asset.network,
      address: asset.address,
      contract: asset.contract ?? null,
      decimals: asset.decimals,
      usdCents: input.usdCents,
      rate: lock.rate.usd,
      rateSource: lock.rate.source,
      baseAtomic: lock.base.toString(),
      expectedAtomic: lock.expected.toString(),
      expectedDisplay: lock.display,
      requiredConfirmations: asset.confirmations,
      expiresAt: new Date(Date.now() + quoteMinutes(settings["payments.crypto.quoteMinutes"]) * 60_000),
    },
  });
}

const quoteMinutes = (n: number) => Math.min(60, Math.max(10, Math.round(n) || 30));

/** A new amount at the current rate, when the previous quote lapsed with nothing received. Same coin, same network, same address. */
export async function requoteCryptoPayment(id: string): Promise<CryptoPayment> {
  const p = await db.cryptoPayment.findUnique({ where: { id }, include: { order: { select: { status: true } } } });
  if (!p) throw new CryptoError("Payment not found.");
  if (p.order.status !== "pending_payment") throw new CryptoError("This order is no longer awaiting payment.");
  if (p.txHash || !["waiting", "expired"].includes(p.status)) throw new CryptoError("A transaction is already being checked for this order.");
  if (p.expiresAt.getTime() > Date.now()) throw new CryptoError("The current amount is still valid.");
  const asset = assetOf(p);
  if (!asset || asset.address !== p.address) throw new CryptoError("This coin and network are no longer available. Please contact us.");
  const settings = await getSettings();
  const lock = await lockAmount(asset, p.usdCents, p.id);
  const updated = await db.cryptoPayment.update({
    where: { id },
    data: { status: "waiting", rate: lock.rate.usd, rateSource: lock.rate.source, baseAtomic: lock.base.toString(), expectedAtomic: lock.expected.toString(), expectedDisplay: lock.display, expiresAt: new Date(Date.now() + quoteMinutes(settings["payments.crypto.quoteMinutes"]) * 60_000), quoteCount: { increment: 1 }, note: null },
  });
  await addOrderEvent(db, p.orderId, "payment.crypto_requoted", `New crypto quote: ${updated.expectedDisplay} ${p.coin} (${asset.networkShort})`);
  return updated;
}

/* ----------------------------------------------------------------- checking */

async function claimedHashes(p: CryptoPayment): Promise<Set<string>> {
  const rows = await db.cryptoPayment.findMany({ where: { network: p.network, txHash: { not: null }, id: { not: p.id } }, select: { txHash: true } });
  return new Set(rows.map((r) => r.txHash!));
}

async function needsReview(p: CryptoPayment, note: string, status: "review" | "underpaid" = "review") {
  if (p.status === status && p.note === note) return;
  await db.cryptoPayment.update({ where: { id: p.id }, data: { status, note } });
  const order = await db.order.findUnique({ where: { id: p.orderId }, select: { number: true } });
  await addOrderEvent(db, p.orderId, "payment.crypto_review", `Crypto payment needs review: ${note}`);
  await notifyAdmins("orders.manage", { type: "order.crypto_review", title: `Crypto payment needs review: ${order?.number ?? ""}`, body: note, href: `/admin/orders/${p.orderId}` });
}

/** Applies what the chain says about the payment's transaction. Returns the fresh row. */
async function applyTransfer(p: CryptoPayment, asset: CryptoAsset, t: Transfer, actor: ActorRef): Promise<CryptoPayment> {
  const stage = progress(t.confirmations, p.requiredConfirmations);
  const received = t.amount.toString();
  // Held for a person: keep counting confirmations, change nothing else.
  if (p.status === "review" || p.status === "underpaid") return db.cryptoPayment.update({ where: { id: p.id }, data: { confirmations: t.confirmations, receivedAtomic: received, lastCheckedAt: new Date() } });
  if (stage !== "confirmed") return db.cryptoPayment.update({ where: { id: p.id }, data: { status: stage, confirmations: t.confirmations, receivedAtomic: received, lastCheckedAt: new Date() } });

  const order = await db.order.findUnique({ where: { id: p.orderId }, select: { status: true, number: true } });
  const seenAt = t.timeMs ?? p.detectedAt?.getTime() ?? Date.now();
  const amountText = `${receivedDecimal(t.amount, p.decimals, 2)} ${p.coin} (${asset.networkShort})`;
  let fresh = await db.cryptoPayment.update({ where: { id: p.id }, data: { confirmations: t.confirmations, receivedAtomic: received, lastCheckedAt: new Date() } });
  if (!order || order.status !== "pending_payment") {
    await needsReview(fresh, `${amountText} arrived and is confirmed, but the order is ${order?.status ?? "missing"}. Refund the buyer or restore the order by hand. Transaction ${t.txHash}`);
    return db.cryptoPayment.findUniqueOrThrow({ where: { id: p.id } });
  }
  if (seenAt > p.expiresAt.getTime() + LOCK_GRACE_MS) {
    await needsReview(fresh, `${amountText} arrived after the quote had lapsed, so the rate is no longer guaranteed. Check the amount against today's price, then mark the order paid or refund. Transaction ${t.txHash}`);
    return db.cryptoPayment.findUniqueOrThrow({ where: { id: p.id } });
  }
  fresh = await db.cryptoPayment.update({ where: { id: p.id }, data: { status: "paid", paidAt: new Date(), note: null } });
  await addOrderEvent(db, p.orderId, "payment.crypto_confirmed", `Crypto payment confirmed on chain: ${amountText}, ${t.confirmations} confirmations, transaction ${t.txHash}`, actor);
  await applyPaymentSuccess(p.paymentId, { raw: { crypto: { coin: p.coin, network: p.network, address: p.address, txHash: t.txHash, received, expected: p.expectedAtomic, confirmations: t.confirmations, rate: p.rate } } }, actor);
  return fresh;
}

/**
 * Looks at the blockchain for one payment and moves it along. Safe to call often: it limits
 * itself, and every step is idempotent. `force` (staff, or right after a hash is given) skips the limit.
 */
export async function checkCryptoPayment(id: string, opts: { force?: boolean; actor?: ActorRef } = {}): Promise<CryptoPayment | null> {
  const actor: ActorRef = opts.actor ?? { id: null, type: "system" };
  let p = await db.cryptoPayment.findUnique({ where: { id } });
  if (!p || p.status === "paid") return p;
  const asset = assetOf(p);
  // The configuration changed under an open payment: never guess another address or network.
  if (!asset || asset.address !== p.address) return p;
  const gap = MIN_CHECK_GAP_MS[asset.family] ?? DEFAULT_CHECK_GAP_MS;
  if (!opts.force && p.lastCheckedAt && Date.now() - p.lastCheckedAt.getTime() < gap) return p;
  const now = Date.now();
  const stillWatched = now < p.expiresAt.getTime() + WATCH_AFTER_EXPIRY_MS;
  if (!p.txHash && !stillWatched) return p;
  // Claim the check so two requests at once do not both call the chain.
  await db.cryptoPayment.update({ where: { id }, data: { lastCheckedAt: new Date() } });

  try {
    if (p.txHash) {
      const t = await lookupTransfer(asset, p.txHash);
      if (t) return await applyTransfer(p, asset, t, actor);
      // Not on chain (yet, or any more). An unconfirmed transaction can be replaced or dropped.
      if (p.confirmations === 0 && p.detectedAt && now - p.detectedAt.getTime() > VANISHED_AFTER_MS && p.status !== "review" && p.status !== "underpaid") {
        await addOrderEvent(db, p.orderId, "payment.crypto_vanished", `Transaction ${p.txHash} was seen unconfirmed and is no longer on the network`);
        return await db.cryptoPayment.update({ where: { id }, data: { txHash: null, txSource: null, receivedAtomic: null, detectedAt: null, status: now > p.expiresAt.getTime() ? "expired" : "waiting", note: "The transaction first seen for this order disappeared from the network before it confirmed." } });
      }
      return await db.cryptoPayment.findUnique({ where: { id } });
    }
    if (detectsAutomatically(asset)) {
      const transfers = await listIncoming(asset, p.createdAt.getTime() - 5 * 60_000);
      const hit = findExact(transfers, openOf(p), await claimedHashes(p));
      if (hit) {
        try {
          p = await db.cryptoPayment.update({ where: { id }, data: { txHash: hit.txHash, txSource: "chain", detectedAt: new Date(), receivedAtomic: hit.amount.toString(), note: null } });
        } catch {
          // Another payment claimed this transaction in the same moment (unique network + hash).
          return await db.cryptoPayment.findUnique({ where: { id } });
        }
        await addOrderEvent(db, p.orderId, "payment.crypto_detected", `Crypto payment detected: ${receivedDecimal(hit.amount, p.decimals, 2)} ${p.coin} (${asset.networkShort}), transaction ${hit.txHash}`);
        return await applyTransfer(p, asset, hit, actor);
      }
    }
    if (p.status === "waiting" && now > p.expiresAt.getTime()) return await db.cryptoPayment.update({ where: { id }, data: { status: "expired" } });
    return await db.cryptoPayment.findUnique({ where: { id } });
  } catch (err) {
    // A blockchain API that is down or rate-limited changes nothing: the next check tries again.
    console.error(`[crypto] check ${assetKey(asset)} failed: ${err instanceof Error ? err.message : "error"}`);
    return db.cryptoPayment.findUnique({ where: { id } });
  }
}

export type SubmitResult = { ok: true; payment: CryptoPayment } | { ok: false; message: string };

/**
 * The buyer (or staff) says which transaction paid the order. This only tells the server where
 * to look: the transaction is read from the chain and has to pay this address, in this asset,
 * the right amount, after the order was placed, and not be tied to another order.
 */
export async function submitTxHash(id: string, rawHash: string, source: "buyer" | "admin", actor: ActorRef): Promise<SubmitResult> {
  const p = await db.cryptoPayment.findUnique({ where: { id }, include: { order: { select: { status: true } } } });
  if (!p) return { ok: false, message: "Payment not found." };
  if (p.status === "paid") return { ok: false, message: "This order is already paid." };
  if (p.txHash) return { ok: false, message: "A transaction is already being checked for this order." };
  const asset = assetOf(p);
  if (!asset || asset.address !== p.address) return { ok: false, message: "This coin and network are no longer available. Please contact us." };
  const candidate = rawHash.trim().replace(/^https?:\/\/\S*\//, "");
  if (!isTxHash(asset.family, candidate)) return { ok: false, message: `That does not look like a ${asset.networkLabel} transaction hash.` };
  const hash = normalizeTxHash(asset.family, candidate);
  if (await db.cryptoPayment.findFirst({ where: { network: p.network, txHash: hash }, select: { id: true } })) return { ok: false, message: "That transaction is already linked to an order." };

  let t: Transfer | null;
  try {
    t = await lookupTransfer(asset, hash);
  } catch (err) {
    console.error(`[crypto] lookup ${assetKey(asset)} failed: ${err instanceof Error ? err.message : "error"}`);
    return { ok: false, message: "We could not reach the blockchain to check that transaction. Please try again in a minute." };
  }
  if (!t) return { ok: false, message: `We could not find a successful ${p.coin} payment to our ${asset.networkLabel} address in that transaction. Check the hash and the network; a transaction that was only just sent can take a minute to appear.` };

  const others = await db.cryptoPayment.findMany({ where: { coin: p.coin, network: p.network, id: { not: p.id }, status: { in: [...OPEN_STATUSES, "expired"] } }, select: { expectedAtomic: true } });
  const verdict = judgeSubmitted(t, openOf(p), others.map((o) => big(o.expectedAtomic)));
  if (verdict.kind === "reject") return { ok: false, message: verdict.reason };

  let row: CryptoPayment;
  try {
    row = await db.cryptoPayment.update({ where: { id }, data: { txHash: t.txHash, txSource: source, detectedAt: new Date(), receivedAtomic: t.amount.toString(), confirmations: t.confirmations, note: null } });
  } catch {
    return { ok: false, message: "That transaction is already linked to an order." };
  }
  const got = `${receivedDecimal(t.amount, p.decimals, 2)} ${p.coin}`;
  await addOrderEvent(db, p.orderId, "payment.crypto_detected", `Crypto transaction given by the ${source} and found on chain: ${got} (${asset.networkShort}), transaction ${t.txHash}`, actor);
  if (verdict.kind === "underpaid") {
    await needsReview(row, `${got} was received; the order needed ${p.expectedDisplay} ${p.coin}. Ask the buyer for the difference or refund. Transaction ${t.txHash}`, "underpaid");
    return { ok: true, payment: await db.cryptoPayment.findUniqueOrThrow({ where: { id } }) };
  }
  if (verdict.kind === "overpaid") {
    await needsReview(row, `${got} was received, well over the ${p.expectedDisplay} ${p.coin} quoted. Confirm it is this buyer's payment before marking the order paid. Transaction ${t.txHash}`);
    return { ok: true, payment: await db.cryptoPayment.findUniqueOrThrow({ where: { id } }) };
  }
  return { ok: true, payment: await applyTransfer(row, asset, t, actor) };
}

/* ---------------------------------------------------------------- jobs, holds */

/** Job: every payment that could still change is checked against the chain. */
export async function sweepCryptoPayments(): Promise<{ checked: number; paid: number }> {
  const rows = await db.cryptoPayment.findMany({
    where: { OR: [{ status: { in: [...OPEN_STATUSES] } }, { status: "expired", expiresAt: { gte: new Date(Date.now() - WATCH_AFTER_EXPIRY_MS) } }, { status: { in: ["review", "underpaid"] }, txHash: { not: null }, updatedAt: { gte: new Date(Date.now() - WATCH_AFTER_EXPIRY_MS) } }] },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 60,
  });
  let paid = 0;
  for (const r of rows) {
    const p = await checkCryptoPayment(r.id, { actor: { id: null, type: "job" } });
    if (p?.status === "paid") paid += 1;
  }
  return { checked: rows.length, paid };
}

/**
 * Whether an unpaid order must be left alone by the job that cancels stale orders: money is on
 * its way or being looked at, or the buyer can still ask for a new quote. A final check of the
 * chain is made before the answer is no.
 */
export async function cryptoHoldsOrder(orderId: string): Promise<boolean> {
  const p = await db.cryptoPayment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
  if (!p) return false;
  const fresh = (await checkCryptoPayment(p.id, { force: true, actor: { id: null, type: "job" } })) ?? p;
  if (["detected", "confirming", "underpaid", "review", "paid"].includes(fresh.status)) return true;
  return Date.now() < fresh.expiresAt.getTime() + REQUOTE_WINDOW_MS;
}

/* -------------------------------------------------------------------- health */

export type CryptoHealthRow = { key: string; coin: string; networkLabel: string; address: string; confirmations: number; automatic: boolean; ok: boolean; detail: string };

/** A syntactically valid transaction id that does not exist, per kind of chain: reading it proves the API answers. */
const PROBE_HASH: Record<string, string> = { evm: `0x${"0".repeat(63)}1`, solana: "1".repeat(87) + "2" };

/**
 * For staff: can this server read each blockchain right now? Lists the store's own address
 * where listing is possible, otherwise looks up a transaction that does not exist. Read-only.
 */
export async function cryptoHealth(): Promise<CryptoHealthRow[]> {
  return Promise.all(
    allAssets().map(async (asset) => {
      const automatic = detectsAutomatically(asset);
      const row = { key: assetKey(asset), coin: asset.coin, networkLabel: asset.networkLabel, address: asset.address, confirmations: asset.confirmations, automatic };
      try {
        if (automatic) {
          const seen = await listIncoming(asset, Date.now() - 3_600_000);
          return { ...row, ok: true, detail: `${seen.length} incoming transfer(s) in the last hour` };
        }
        await lookupTransfer(asset, PROBE_HASH[asset.family] ?? "0".repeat(63) + "1");
        return { ...row, ok: true, detail: "Transactions can be verified by hash. Set ETHERSCAN_API_KEY to detect them automatically." };
      } catch (err) {
        return { ...row, ok: false, detail: `${err instanceof Error ? err.message : "error"}. Payments in this coin stay "waiting" until the API answers; see the crypto section of .env.example for your own endpoint or key.` };
      }
    }),
  );
}

/* --------------------------------------------------------------------- views */

export type CryptoView = {
  id: string;
  status: string;
  coin: string;
  coinName: string;
  network: string;
  networkLabel: string;
  networkShort: string;
  note: string | null;
  address: string;
  /** exact amount to send, plain ("1250.0037") and grouped for reading ("1,250.0037") */
  amount: string;
  amountLabel: string;
  usdLabel: string;
  rateLabel: string;
  expiresAt: string;
  /** seconds left on the quote when this was produced; counted down in the browser from here, so its clock does not matter */
  secondsLeft: number;
  txHash: string | null;
  explorerUrl: string | null;
  receivedLabel: string | null;
  confirmations: number;
  requiredConfirmations: number;
  /** false: this network needs the transaction hash from the buyer */
  automatic: boolean;
  canRequote: boolean;
  /** QR code of the address (with the amount for Bitcoin and Litecoin), as an inline SVG */
  qrSvg: string;
};

export async function cryptoView(p: CryptoPayment, orderStatus: string): Promise<CryptoView | null> {
  const asset = assetOf(p);
  // Shown only while the stored address is still the configured one for this exact coin and network.
  if (!asset || asset.address !== p.address) return null;
  const rate = Number(p.rate);
  return {
    id: p.id,
    status: p.status,
    coin: p.coin,
    coinName: CRYPTO[asset.coin].name,
    network: p.network,
    networkLabel: asset.networkLabel,
    networkShort: asset.networkShort,
    note: asset.note ?? null,
    address: p.address,
    amount: p.expectedDisplay,
    amountLabel: `${groupDecimal(p.expectedDisplay)} ${p.coin}`,
    usdLabel: `${formatMoney(p.usdCents, "USD")} USD`,
    rateLabel: p.coin === "USDT" ? "1 USDT = 1 USD" : `1 ${p.coin} = ${rate.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}`,
    expiresAt: p.expiresAt.toISOString(),
    secondsLeft: Math.max(0, Math.round((p.expiresAt.getTime() - Date.now()) / 1000)),
    txHash: p.txHash,
    explorerUrl: p.txHash ? `${asset.explorerTx}${p.txHash}` : null,
    receivedLabel: p.receivedAtomic ? `${receivedDecimal(big(p.receivedAtomic), p.decimals, 2)} ${p.coin}` : null,
    confirmations: Math.min(p.confirmations, p.requiredConfirmations),
    requiredConfirmations: p.requiredConfirmations,
    automatic: detectsAutomatically(asset),
    canRequote: orderStatus === "pending_payment" && !p.txHash && ["waiting", "expired"].includes(p.status) && p.expiresAt.getTime() <= Date.now(),
    qrSvg: await QRCode.toString(paymentUri(asset, p.expectedDisplay), { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
  };
}

/** Plain-text payment instructions for the confirmation email. */
export function cryptoInstructions(p: CryptoPayment, payUrl: string): string {
  const asset = assetOf(p);
  return [
    `Pay with ${p.coin} on ${asset?.networkLabel ?? p.network}.`,
    `Amount: ${p.expectedDisplay} ${p.coin} (send exactly this amount)`,
    `Address: ${p.address}`,
    `Network: ${asset?.networkLabel ?? p.network}`,
    "",
    "Only send the selected cryptocurrency using the selected network. Sending through another network may result in permanent loss.",
    `This amount is held until ${p.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC. Payment page and live status: ${payUrl}`,
    "Your order is confirmed once the payment has been verified on the blockchain.",
  ].join("\n");
}
