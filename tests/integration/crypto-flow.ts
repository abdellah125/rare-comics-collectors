/**
 * Crypto payment flow against the local database with a simulated blockchain.
 *
 *   npx tsx --conditions=react-server tests/integration/crypto-flow.ts
 *
 * The real service code runs unchanged; only `fetch` is replaced, so every price and every
 * blockchain answer comes from the tables below and nothing leaves the machine. What is being
 * proved: an order becomes paid only from what the chain reports, after the required
 * confirmations, for the right amount, to the right address, inside the quote window.
 * Needs the main seed plus the e2e seed. Everything it creates is removed at the end.
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");
// The simulated chain below answers on these hosts; make sure no personal endpoint or key is used instead.
for (const k of ["BITCOIN_API_URL", "ETH_RPC_URL", "BSC_RPC_URL", "TRON_API_URL", "SOLANA_RPC_URL", "ETHERSCAN_API_KEY", "TRONGRID_API_KEY", "BLOCKCYPHER_TOKEN"]) delete process.env[k];

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/* ------------------------------------------------------- simulated chain */
const BTC = "bc1qnhxkhlks4vefy8j287hu5evhxmz5v5395gxkhh";
const EVM = "0x7DA32E72a89ee85529cf28530998236a21a9D8a9";
type BtcTx = { txid: string; to: string; sats: bigint; height: number | null; time: number };
type EthTx = { hash: string; to: string; wei: bigint; block: number | null; time: number; ok: boolean };
const chain = { btcTip: 900_000, btc: [] as BtcTx[], ethHead: 20_000_000, eth: [] as EthTx[], calls: 0, outside: [] as string[] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const esplora = (t: BtcTx) => ({ txid: t.txid, vout: [{ scriptpubkey_address: t.to, value: Number(t.sats) }, { scriptpubkey_address: "bc1qchangechangechangechangechangechangexx", value: 1234 }], status: t.height === null ? { confirmed: false } : { confirmed: true, block_height: t.height, block_time: Math.floor(t.time / 1000) } });
const hex = (n: number | bigint) => `0x${n.toString(16)}`;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  chain.calls += 1;
  const u = new URL(url);
  if (u.host === "api.coinbase.com") {
    const coin = u.pathname.split("/")[3]?.split("-")[0];
    const usd = { BTC: "80000", ETH: "2500", BNB: "800", LTC: "70", USDT: "1.0001" }[coin ?? ""];
    return usd ? json({ data: { amount: usd } }) : json({}, 404);
  }
  if (u.host === "api.coingecko.com") return json({ bitcoin: { usd: 80100 }, ethereum: { usd: 2503 }, binancecoin: { usd: 801 }, litecoin: { usd: 70.1 }, tether: { usd: 0.9999 } });
  if (u.host === "mempool.space") {
    if (u.pathname === "/api/blocks/tip/height") return json(chain.btcTip);
    const addr = u.pathname.match(/^\/api\/address\/([^/]+)\/txs$/)?.[1];
    if (addr) return json(chain.btc.filter((t) => t.to === addr).map(esplora));
    const txid = u.pathname.match(/^\/api\/tx\/([0-9a-f]{64})$/)?.[1];
    if (txid) {
      const t = chain.btc.find((x) => x.txid === txid);
      return t ? json(esplora(t)) : json({}, 404);
    }
  }
  if (u.host === "ethereum-rpc.publicnode.com") {
    const { method, params } = JSON.parse(String(init?.body ?? "{}")) as { method: string; params: unknown[] };
    const find = (h: unknown) => chain.eth.find((t) => t.hash === String(h).toLowerCase());
    const result = (() => {
      if (method === "eth_blockNumber") return hex(chain.ethHead);
      if (method === "eth_getTransactionByHash") {
        const t = find(params[0]);
        return t ? { hash: t.hash, to: t.to, value: hex(t.wei), input: "0x", blockNumber: t.block === null ? null : hex(t.block) } : null;
      }
      if (method === "eth_getTransactionReceipt") {
        const t = find(params[0]);
        return t && t.block !== null ? { status: t.ok ? "0x1" : "0x0", blockNumber: hex(t.block), logs: [] } : null;
      }
      if (method === "eth_getBlockByNumber") {
        const t = chain.eth.find((x) => x.block !== null && hex(x.block) === params[0]);
        return { number: params[0] === "latest" ? hex(chain.ethHead) : params[0], timestamp: hex(Math.floor((t?.time ?? Date.now()) / 1000)) };
      }
      if (method === "eth_getLogs") return [];
      return null;
    })();
    return json({ jsonrpc: "2.0", id: 1, result });
  }
  chain.outside.push(u.host);
  return json({ error: "simulated: no such service" }, 503);
}) as typeof fetch;

const txid = (n: number) => n.toString(16).padStart(64, "0");

async function main() {
  const db = new PrismaClient();
  const svc = await import("@/lib/crypto-payments/service");
  const { forgetLists } = await import("@/lib/crypto-payments/chains");
  const { cancelOrder } = await import("@/lib/orders/lifecycle");
  const sys = { id: null, type: "system" as const };

  const buyer = await db.user.findUniqueOrThrow({ where: { email: "e2e-buyer@example.com" } });
  const product = await db.product.findUniqueOrThrow({ where: { sku: "E2E-001" } });
  if (!product.sellerId) throw new Error("E2E product has no seller");
  const stock0 = product.stock;
  const created: string[] = [];

  async function makeOrder() {
    const number = `RCC-CT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
    const total = product.price;
    await db.product.update({ where: { id: product.id }, data: { stock: { increment: 0 } } });
    const order = await db.order.create({
      data: {
        number,
        userId: buyer.id,
        email: buyer.email,
        subtotal: total,
        total,
        presentmentTotal: total,
        countryCode: "US",
        items: { create: [{ productId: product.id, sellerId: product.sellerId!, kind: "comic", title: `${product.title} ${product.issue}`, slug: product.slug, sku: product.sku, unitPrice: total, qty: 1, subtotal: total, commissionBps: 1000, commissionAmount: Math.round(total / 10), sellerNet: total - Math.round(total / 10) }] },
        payments: { create: [{ provider: "crypto", method: "crypto", status: "pending", amount: total, currency: "USD", presentmentAmount: total }] },
      },
      include: { payments: true },
    });
    created.push(order.id);
    return order;
  }
  const start = async (coin: string, network: string) => {
    const o = await makeOrder();
    const p = await svc.createCryptoPayment({ orderId: o.id, paymentId: o.payments[0].id, usdCents: o.total, coin, network });
    return { o, p };
  };
  const recheck = async (id: string) => {
    forgetLists();
    return (await svc.checkCryptoPayment(id, { force: true }))!;
  };
  const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id }, select: { status: true, paymentStatus: true } });
  const now = () => Date.now();

  // 0. An unknown pair is refused outright.
  {
    const o = await makeOrder();
    const tries = await Promise.all([["USDT", "BITCOIN"], ["BTC", "TRON"], ["DOGE", "BSC"], ["", ""]].map(([c, n]) => svc.createCryptoPayment({ orderId: o.id, paymentId: o.payments[0].id, usdCents: o.total, coin: c, network: n }).then(() => "created", () => "refused")));
    check("an unknown coin/network pair creates nothing", tries.every((t) => t === "refused") && (await db.cryptoPayment.count({ where: { orderId: o.id } })) === 0, tries.join(","));
  }

  // 1. Bitcoin, found by amount: waiting → detected → confirming → paid.
  {
    const { o, p } = await start("BTC", "BITCOIN");
    check("the quote stores the Bitcoin address and nothing else", p.address === BTC && p.network === "BITCOIN" && p.contract === null, p.address);
    check("the amount covers the order at the quoted rate and carries a tag", BigInt(p.expectedAtomic) > BigInt(p.baseAtomic) && BigInt(p.expectedAtomic) - BigInt(p.baseAtomic) < BigInt(100) && Number(p.expectedDisplay) * Number(p.rate) >= o.total / 100, `${p.expectedDisplay} BTC at ${p.rate}`);
    let s = await recheck(p.id);
    check("nothing on chain: still waiting, order unpaid", s.status === "waiting" && (await orderOf(o.id)).paymentStatus === "unpaid", s.status);

    // Transfers that must not count: the rounded total without the tag, a different amount, and the right amount from before the order.
    chain.btc.push({ txid: txid(1), to: BTC, sats: BigInt(p.baseAtomic), height: null, time: now() });
    chain.btc.push({ txid: txid(2), to: BTC, sats: BigInt(p.expectedAtomic) + BigInt(1), height: null, time: now() });
    chain.btc.push({ txid: txid(3), to: BTC, sats: BigInt(p.expectedAtomic), height: chain.btcTip - 50, time: now() - 6 * 3_600_000 });
    chain.btc.push({ txid: txid(4), to: "bc1qsomeoneelsesomeoneelsesomeoneelsesomexx", sats: BigInt(p.expectedAtomic), height: null, time: now() });
    s = await recheck(p.id);
    check("near amounts, old transfers and other addresses are not matched", s.status === "waiting" && s.txHash === null, `${s.status} ${s.txHash ?? ""}`);

    chain.btc.push({ txid: txid(5), to: BTC, sats: BigInt(p.expectedAtomic), height: null, time: now() });
    s = await recheck(p.id);
    check("exact amount in the mempool: payment detected, order still unpaid", s.status === "detected" && s.txHash === txid(5) && s.txSource === "chain" && (await orderOf(o.id)).paymentStatus === "unpaid", s.status);
    chain.btc.find((t) => t.txid === txid(5))!.height = chain.btcTip;
    s = await recheck(p.id);
    check("one confirmation of two: confirming, order still unpaid", s.status === "confirming" && s.confirmations === 1 && (await orderOf(o.id)).paymentStatus === "unpaid", `${s.status} ${s.confirmations}`);
    chain.btcTip += 1;
    s = await recheck(p.id);
    const after = await orderOf(o.id);
    const pay = await db.payment.findUniqueOrThrow({ where: { id: o.payments[0].id } });
    check("two confirmations: paid, and only now is the order paid", s.status === "paid" && s.confirmations === 2 && after.status === "paid" && after.paymentStatus === "paid" && pay.status === "succeeded", `${s.status} order=${after.status}/${after.paymentStatus}`);
    check("the payment record keeps the transaction", (pay.rawJson ?? "").includes(txid(5)) && s.paidAt !== null && s.receivedAtomic === p.expectedAtomic, "");
    const again = await recheck(p.id);
    check("checking again changes nothing", again.status === "paid" && (await db.ledgerEntry.count({ where: { orderId: o.id } })) === 2, "");
  }

  // 2. Two open payments in the same coin never share an amount, and one's transfer never pays the other.
  {
    const a = await start("BTC", "BITCOIN");
    const b = await start("BTC", "BITCOIN");
    check("two orders of the same total get different amounts", a.p.expectedAtomic !== b.p.expectedAtomic && a.p.baseAtomic === b.p.baseAtomic, `${a.p.expectedDisplay} / ${b.p.expectedDisplay}`);
    chain.btc.push({ txid: txid(10), to: BTC, sats: BigInt(a.p.expectedAtomic), height: chain.btcTip, time: now() });
    const sb = await recheck(b.p.id);
    check("a transfer for one order does not move the other", sb.status === "waiting" && sb.txHash === null, sb.status);
    const stolen = await svc.submitTxHash(b.p.id, txid(10), "buyer", sys);
    check("giving another order's transaction hash is refused", !stolen.ok && (await orderOf(b.o.id)).paymentStatus === "unpaid", stolen.ok ? "accepted" : stolen.message);
    const sa = await recheck(a.p.id);
    check("the transfer is tied to the order it was quoted for", sa.txHash === txid(10) && sa.status === "confirming", `${sa.status}`);
    const reuse = await svc.submitTxHash(b.p.id, txid(10), "buyer", sys);
    check("a transaction already tied to an order cannot be used again", !reuse.ok, reuse.ok ? "accepted" : reuse.message);
  }

  // 3. ETH has no automatic detection without an indexer: the hash is given, and judged on chain.
  {
    const { o, p } = await start("ETH", "ETHEREUM");
    check("ETH on Ethereum stores the EVM address", p.address === EVM && p.network === "ETHEREUM" && p.contract === null, p.address);
    const h = (n: number) => `0x${txid(n)}`;
    const bad = await Promise.all([svc.submitTxHash(p.id, "not a hash", "buyer", sys), svc.submitTxHash(p.id, txid(20), "buyer", sys), svc.submitTxHash(p.id, h(20), "buyer", sys)]);
    check("a malformed or unknown hash is refused", bad.every((r) => !r.ok), bad.map((r) => (r.ok ? "ok" : "no")).join(","));
    chain.eth.push({ hash: h(21), to: "0x1111111111111111111111111111111111111111", wei: BigInt(p.expectedAtomic), block: chain.ethHead - 3, time: now(), ok: true });
    chain.eth.push({ hash: h(22), to: EVM.toLowerCase(), wei: BigInt(p.expectedAtomic), block: chain.ethHead - 3, time: now(), ok: false });
    chain.eth.push({ hash: h(23), to: EVM.toLowerCase(), wei: BigInt(p.expectedAtomic), block: chain.ethHead - 9000, time: now() - 30 * 3_600_000, ok: true });
    const r1 = await svc.submitTxHash(p.id, h(21), "buyer", sys);
    const r2 = await svc.submitTxHash(p.id, h(22), "buyer", sys);
    const r3 = await svc.submitTxHash(p.id, h(23), "buyer", sys);
    check("a transfer to another address, a failed one and an old one are all refused", !r1.ok && !r2.ok && !r3.ok && (await orderOf(o.id)).paymentStatus === "unpaid", [r1, r2, r3].map((r) => (r.ok ? "ok" : "no")).join(","));
    chain.eth.push({ hash: h(24), to: EVM.toLowerCase(), wei: BigInt(p.expectedAtomic), block: chain.ethHead - 2, time: now(), ok: true });
    const r4 = await svc.submitTxHash(p.id, h(24).toUpperCase().replace("0X", "0x"), "buyer", sys);
    check("the right transaction is accepted but the order waits for confirmations", r4.ok && r4.payment.status === "confirming" && r4.payment.confirmations === 3 && (await orderOf(o.id)).paymentStatus === "unpaid", r4.ok ? `${r4.payment.status} ${r4.payment.confirmations}/12` : r4.message);
    chain.ethHead += 8;
    let s = await recheck(p.id);
    check("eleven of twelve confirmations: still unpaid", s.status === "confirming" && s.confirmations === 11 && (await orderOf(o.id)).paymentStatus === "unpaid", `${s.confirmations}`);
    chain.ethHead += 1;
    s = await recheck(p.id);
    check("twelve confirmations: paid", s.status === "paid" && (await orderOf(o.id)).paymentStatus === "paid", s.status);
  }

  // 4. A short payment is recorded for staff and never marks the order paid.
  {
    const { o, p } = await start("ETH", "ETHEREUM");
    const h = `0x${txid(30)}`;
    chain.eth.push({ hash: h, to: EVM.toLowerCase(), wei: (BigInt(p.baseAtomic) * BigInt(97)) / BigInt(100), block: chain.ethHead - 40, time: now(), ok: true });
    const r = await svc.submitTxHash(p.id, h, "buyer", sys);
    const s = await recheck(p.id);
    check("a payment 3% short is held as underpaid, with the order unpaid", r.ok && s.status === "underpaid" && (await orderOf(o.id)).paymentStatus === "unpaid" && Boolean(s.note), `${s.status}`);
  }

  // 5. A transfer after the quote lapsed is not honoured automatically.
  {
    const { o, p } = await start("BTC", "BITCOIN");
    await db.cryptoPayment.update({ where: { id: p.id }, data: { createdAt: new Date(now() - 3 * 3_600_000), expiresAt: new Date(now() - 2 * 3_600_000) } });
    let s = await recheck(p.id);
    check("a quote with nothing received expires", s.status === "expired", s.status);
    chain.btc.push({ txid: txid(40), to: BTC, sats: BigInt(p.expectedAtomic), height: chain.btcTip - 5, time: now() - 60_000 });
    s = await recheck(p.id);
    check("a confirmed transfer after the quote lapsed goes to review, order unpaid", s.status === "review" && s.txHash === txid(40) && (await orderOf(o.id)).paymentStatus === "unpaid", s.status);
  }

  // 6. An expired quote can be renewed while the order is reserved; the hold ends after the window.
  {
    const { o, p } = await start("BTC", "BITCOIN");
    const early = await svc.requoteCryptoPayment(p.id).then(() => "requoted", () => "refused");
    check("a quote that is still valid cannot be replaced", early === "refused", early);
    await db.cryptoPayment.update({ where: { id: p.id }, data: { expiresAt: new Date(now() - 60_000) } });
    check("an order with a just-expired quote is still held for a new one", await svc.cryptoHoldsOrder(o.id), "");
    const q = await svc.requoteCryptoPayment(p.id);
    check("a new quote keeps the coin, network and address", q.status === "waiting" && q.address === p.address && q.network === p.network && q.quoteCount === 2 && q.expiresAt.getTime() > now(), q.expectedDisplay);
    await db.cryptoPayment.update({ where: { id: p.id }, data: { expiresAt: new Date(now() - 2 * 3_600_000) } });
    check("long after the quote lapsed the order is no longer held", !(await svc.cryptoHoldsOrder(o.id)), "");
  }

  // 7. Money for a cancelled order is flagged, not silently accepted.
  {
    const { o, p } = await start("BTC", "BITCOIN");
    await cancelOrder(o.id, "reservation expired", { id: null, type: "job" }, { notify: false });
    chain.btc.push({ txid: txid(50), to: BTC, sats: BigInt(p.expectedAtomic), height: chain.btcTip - 4, time: now() });
    const s = await recheck(p.id);
    const after = await orderOf(o.id);
    check("a confirmed transfer for a cancelled order goes to review", s.status === "review" && after.status === "cancelled" && after.paymentStatus === "unpaid", `${s.status} order=${after.status}`);
  }

  // 8. A payment in progress keeps its order from being cancelled.
  {
    const { o, p } = await start("BTC", "BITCOIN");
    chain.btc.push({ txid: txid(60), to: BTC, sats: BigInt(p.expectedAtomic), height: null, time: now() });
    await recheck(p.id);
    await db.cryptoPayment.update({ where: { id: p.id }, data: { expiresAt: new Date(now() - 2 * 3_600_000) } });
    check("a detected payment holds the order past the quote window", await svc.cryptoHoldsOrder(o.id), "");
  }

  check("no request left the simulated services", chain.outside.length === 0, [...new Set(chain.outside)].join(","));

  for (const id of created) {
    await db.cryptoPayment.deleteMany({ where: { orderId: id } });
    await db.ledgerEntry.deleteMany({ where: { orderId: id } });
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.orderEvent.deleteMany({ where: { orderId: id } });
    await db.inventoryAdjustment.deleteMany({ where: { orderId: id } });
    await db.orderItem.deleteMany({ where: { orderId: id } });
    await db.order.delete({ where: { id } }).catch(() => {});
  }
  await db.product.update({ where: { id: product.id }, data: { stock: stock0, soldCount: product.soldCount } });
  await db.notification.deleteMany({ where: { OR: [{ title: { contains: "RCC-CT-" } }, { body: { contains: "RCC-CT-" } }] } });
  await db.emailLog.deleteMany({ where: { subject: { contains: "RCC-CT-" } } });
  await db.$disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
