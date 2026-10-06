import { describe, expect, it } from "vitest";
import { atomicToDecimal, baseAtomic, groupDecimal, payDecimal, rateToE8, receivedDecimal, withTag } from "@/lib/crypto-payments/amounts";
import { CRYPTO, NETWORK_WARNING, allAssets, getAsset, isTxHash, normalizeTxHash, paymentUri } from "@/lib/crypto-payments/assets";
import { tronAddressToHex } from "@/lib/crypto-payments/chains/tron";
import type { Transfer } from "@/lib/crypto-payments/chains/types";
import { findExact, judgeSubmitted, progress, type OpenPayment } from "@/lib/crypto-payments/match";
import { reconcileRate } from "@/lib/crypto-payments/rates";

const EVM = "0x7DA32E72a89ee85529cf28530998236a21a9D8a9";
/** The owner's list, written out a second time on purpose: the configuration must match it exactly. */
const EXPECTED: Record<string, string> = {
  "USDT:BSC": EVM,
  "USDT:ETHEREUM": EVM,
  "USDT:SOLANA": "DURksVqkbWDUjRp4oRkTrvvG3P4XipMF3KB4Mnm2Mmt8",
  "USDT:TRON": "TQHU9kixeM6kWwuQoq5kSpqftEzGjBfpwG",
  "BTC:BITCOIN": "bc1qnhxkhlks4vefy8j287hu5evhxmz5v5395gxkhh",
  "BNB:BSC": EVM,
  "ETH:ETHEREUM": EVM,
  "LTC:LITECOIN": "LT3hnd2TafAShboJxdJwB1bh4G5TUCcqxP",
  "LTC:BSC": EVM,
};

describe("coins, networks and addresses", () => {
  it("offers exactly the agreed coin and network pairs, each with its own address", () => {
    const got = Object.fromEntries(allAssets().map((a) => [`${a.coin}:${a.network}`, a.address]));
    expect(got).toEqual(EXPECTED);
  });

  it("resolves a pair only as a pair, with no fallback to another network", () => {
    for (const [key, address] of Object.entries(EXPECTED)) {
      const [coin, network] = key.split(":");
      expect(getAsset(coin, network)?.address).toBe(address);
    }
    for (const [coin, network] of [["USDT", "BITCOIN"], ["USDT", "LITECOIN"], ["BTC", "BSC"], ["BTC", "TRON"], ["ETH", "BSC"], ["BNB", "ETHEREUM"], ["LTC", "TRON"], ["DOGE", "BSC"], ["usdt", "TRON"], ["USDT", "tron"], ["USDT", ""], ["", "TRON"], ["__proto__", "TRON"], ["USDT", "constructor"]]) {
      expect(getAsset(coin, network), `${coin}/${network}`).toBeNull();
    }
    expect(getAsset(undefined, undefined)).toBeNull();
    expect(getAsset({ toString: () => "USDT" }, "TRON")).toBeNull();
  });

  it("never shows an EVM address for Tron, Solana, Bitcoin or Litecoin, and the reverse", () => {
    for (const a of allAssets()) {
      if (a.family === "evm") expect(a.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      if (a.family === "tron") expect(a.address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
      if (a.family === "solana") expect(a.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
      if (a.family === "bitcoin") expect(a.address).toMatch(/^bc1[0-9a-z]{38,60}$/);
      if (a.family === "litecoin") expect(a.address).toMatch(/^(L|M|ltc1)[0-9A-Za-z]{25,60}$/);
    }
    expect(getAsset("USDT", "TRON")!.address.startsWith("0x")).toBe(false);
    expect(getAsset("USDT", "SOLANA")!.address.startsWith("0x")).toBe(false);
  });

  it("uses the right token contract and decimals on each network", () => {
    expect(getAsset("USDT", "ETHEREUM")).toMatchObject({ contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, kind: "token" });
    expect(getAsset("USDT", "BSC")).toMatchObject({ contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, kind: "token" });
    expect(getAsset("USDT", "TRON")).toMatchObject({ contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, kind: "token" });
    expect(getAsset("USDT", "SOLANA")).toMatchObject({ contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, kind: "token" });
    for (const [c, n] of [["BTC", "BITCOIN"], ["ETH", "ETHEREUM"], ["BNB", "BSC"], ["LTC", "LITECOIN"]]) expect(getAsset(c, n)).toMatchObject({ kind: "native" });
    for (const [c, n] of [["BTC", "BITCOIN"], ["ETH", "ETHEREUM"], ["BNB", "BSC"], ["LTC", "LITECOIN"]]) expect(getAsset(c, n)!.contract).toBeUndefined();
  });

  it("labels the BSC Litecoin token so it cannot be taken for native Litecoin", () => {
    const token = getAsset("LTC", "BSC")!;
    expect(token.networkLabel).toMatch(/LTC on BSC/);
    expect(token.note).toMatch(/not native Litecoin/);
    expect(getAsset("LTC", "LITECOIN")!.networkLabel).toBe("Litecoin");
    expect(Object.keys(CRYPTO.LTC.networks)).toEqual(["LITECOIN", "BSC"]);
  });

  it("requires confirmations on every network and carries the warning text", () => {
    for (const a of allAssets()) expect(a.confirmations).toBeGreaterThanOrEqual(2);
    expect(NETWORK_WARNING).toBe("Only send the selected cryptocurrency using the selected network. Sending through another network may result in permanent loss.");
  });

  it("recognises transaction hashes per chain and refuses anything else", () => {
    const hex = "ab".repeat(32);
    expect(isTxHash("evm", `0x${hex}`)).toBe(true);
    expect(isTxHash("evm", hex)).toBe(false);
    expect(isTxHash("bitcoin", hex)).toBe(true);
    expect(isTxHash("tron", hex)).toBe(true);
    expect(isTxHash("litecoin", `${hex}00`)).toBe(false);
    expect(isTxHash("solana", "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW")).toBe(true);
    expect(isTxHash("solana", "0OIl")).toBe(false);
    expect(isTxHash("bitcoin", "'; drop table")).toBe(false);
    expect(normalizeTxHash("evm", ` 0x${hex.toUpperCase()} `)).toBe(`0x${hex}`.toLowerCase());
    expect(normalizeTxHash("solana", "AbC")).toBe("AbC");
  });

  it("puts the amount in the QR code only where wallets understand it", () => {
    expect(paymentUri(getAsset("BTC", "BITCOIN")!, "0.01444312")).toBe("bitcoin:bc1qnhxkhlks4vefy8j287hu5evhxmz5v5395gxkhh?amount=0.01444312");
    expect(paymentUri(getAsset("LTC", "LITECOIN")!, "17.832537")).toBe("litecoin:LT3hnd2TafAShboJxdJwB1bh4G5TUCcqxP?amount=17.832537");
    expect(paymentUri(getAsset("USDT", "TRON")!, "1250.0037")).toBe("TQHU9kixeM6kWwuQoq5kSpqftEzGjBfpwG");
    expect(paymentUri(getAsset("LTC", "BSC")!, "17.832537")).toBe(EVM);
  });

  it("converts a Tron address to the hex form used in contract logs, and checks its checksum", () => {
    expect(tronAddressToHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe("a614f803b6fd780986a42c78ec9c7f77e6ded13c");
    expect(tronAddressToHex("TQHU9kixeM6kWwuQoq5kSpqftEzGjBfpwG")).toMatch(/^[0-9a-f]{40}$/);
    expect(() => tronAddressToHex("TQHU9kixeM6kWwuQoq5kSpqftEzGjBfpwH")).toThrow();
  });
});

describe("amounts", () => {
  const usdtTron = getAsset("USDT", "TRON")!;
  const usdtBsc = getAsset("USDT", "BSC")!;
  const btc = getAsset("BTC", "BITCOIN")!;

  it("quotes USDT one to one, in the network's own decimals", () => {
    expect(baseAtomic(125_000, "1", usdtTron)).toBe(BigInt("1250000000"));
    expect(baseAtomic(125_000, "1", usdtBsc)).toBe(BigInt("1250000000000000000000"));
    expect(payDecimal(baseAtomic(125_000, "1", usdtTron), usdtTron)).toBe("1250.0000");
  });

  it("rounds up, never down, so the order is always covered", () => {
    // $1,250 at $86,565.775: 0.014440... BTC, rounded up at the sixth decimal
    const base = baseAtomic(125_000, "86565.775", btc);
    expect(atomicToDecimal(base, 8, 8)).toBe("0.01444000");
    expect(Number(atomicToDecimal(base, 8, 8)) * 86565.775).toBeGreaterThanOrEqual(1250);
    expect(baseAtomic(1, "86565.775", btc)).toBe(BigInt(100)); // one cent still costs the smallest quoted unit
  });

  it("adds a two-digit tag below the quoted precision", () => {
    const base = baseAtomic(125_000, "1", usdtTron);
    expect(payDecimal(withTag(base, 37, usdtTron), usdtTron)).toBe("1250.0037");
    expect(payDecimal(withTag(base, 1, usdtTron), usdtTron)).toBe("1250.0001");
    expect(payDecimal(withTag(baseAtomic(125_000, "1", usdtBsc), 99, usdtBsc), usdtBsc)).toBe("1250.0099");
    expect(payDecimal(withTag(baseAtomic(125_000, "86565.775", btc), 12, btc), btc)).toBe("0.01444012");
    expect(() => withTag(base, 0, usdtTron)).toThrow();
    expect(() => withTag(base, 100, usdtTron)).toThrow();
    // 99 tags, 99 different amounts, all above the base and within one quoted unit of it
    const all = new Set(Array.from({ length: 99 }, (_, i) => withTag(base, i + 1, usdtTron)));
    expect(all.size).toBe(99);
    for (const a of all) expect(a > base && a < base + BigInt(10_000)).toBe(true);
  });

  it("refuses bad input", () => {
    expect(() => baseAtomic(0, "1", usdtTron)).toThrow();
    expect(() => baseAtomic(12.5, "1", usdtTron)).toThrow();
    expect(() => baseAtomic(100, "0", usdtTron)).toThrow();
    expect(() => baseAtomic(100, "-5", usdtTron)).toThrow();
    expect(() => rateToE8("1e5")).toThrow();
    expect(rateToE8("86565.775")).toBe(BigInt("8656577500000"));
    expect(rateToE8(0.5)).toBe(BigInt(50_000_000));
  });

  it("prints amounts for people and for wallets", () => {
    expect(groupDecimal("1250.0037")).toBe("1,250.0037");
    expect(groupDecimal("1234567.5")).toBe("1,234,567.5");
    expect(groupDecimal("0.01444012")).toBe("0.01444012");
    expect(receivedDecimal(BigInt("1250003700"), 6, 2)).toBe("1250.0037");
    expect(receivedDecimal(BigInt("1250000000"), 6, 2)).toBe("1250.00");
    expect(receivedDecimal(BigInt("4990720531589711"), 18, 2)).toBe("0.004990720531589711");
  });
});

describe("exchange rates", () => {
  it("uses a price only when the two sources agree", () => {
    expect(reconcileRate("BTC", 86565.775, 86585)).toEqual({ usd: "86565.775", source: "Coinbase (checked against CoinGecko)" });
    expect(reconcileRate("BTC", 86565, 80000)).toBeNull();
    expect(reconcileRate("ETH", undefined, 2722.92)).toEqual({ usd: "2722.92", source: "CoinGecko" });
    expect(reconcileRate("LTC", 70.1, undefined)).toEqual({ usd: "70.1", source: "Coinbase" });
    expect(reconcileRate("BNB", undefined, undefined)).toBeNull();
  });

  it("quotes USDT at one dollar only while the market agrees it is worth one", () => {
    expect(reconcileRate("USDT", 0.999875, 0.999954)?.usd).toBe("1");
    expect(reconcileRate("USDT", 0.95, 0.999)).toBeNull();
    expect(reconcileRate("USDT", undefined, 0.9)).toBeNull();
    expect(reconcileRate("USDT", undefined, undefined)).toBeNull();
  });
});

describe("matching a transfer to an order", () => {
  const t0 = Date.UTC(2026, 9, 6, 12, 0, 0);
  const payment: OpenPayment = { id: "p1", expected: BigInt("1250003700"), base: BigInt("1250000000"), createdMs: t0 };
  const tx = (amount: string, timeMs: number | null = t0 + 60_000, txHash = "aa"): Transfer => ({ txHash, amount: BigInt(amount), confirmations: timeMs === null ? 0 : 3, timeMs });

  it("finds the transfer with exactly the quoted amount", () => {
    expect(findExact([tx("1250000000", t0 + 1, "x"), tx("1250003700", t0 + 2, "y"), tx("1250003800", t0 + 3, "z")], payment, new Set())?.txHash).toBe("y");
    expect(findExact([tx("1250003700", null, "mempool")], payment, new Set())?.txHash).toBe("mempool");
  });

  it("ignores a transfer made before the order existed, or already tied to another order", () => {
    expect(findExact([tx("1250003700", t0 - 3_600_000)], payment, new Set())).toBeNull();
    expect(findExact([tx("1250003700", t0 + 5, "taken")], payment, new Set(["taken"]))).toBeNull();
    expect(findExact([tx("1250003700", t0 + 5, "taken"), tx("1250003700", t0 + 9, "free")], payment, new Set(["taken"]))?.txHash).toBe("free");
  });

  it("does not match near amounts automatically", () => {
    for (const a of ["1250000000", "1250003699", "1250003701", "1250010000", "12500037"]) expect(findExact([tx(a)], payment, new Set()), a).toBeNull();
  });

  it("accepts a submitted transaction for the exact amount or the rounded order total", () => {
    expect(judgeSubmitted(tx("1250003700"), payment, [])).toEqual({ kind: "match" });
    expect(judgeSubmitted(tx("1250000000"), payment, [])).toEqual({ kind: "match" }); // wallet dropped the tag digits
    expect(judgeSubmitted(tx("1255000000"), payment, [])).toEqual({ kind: "match" }); // small overpayment
  });

  it("sends short and large-over payments to a person instead of marking the order paid", () => {
    expect(judgeSubmitted(tx("1249000000"), payment, [])).toEqual({ kind: "underpaid" });
    expect(judgeSubmitted(tx("700000000"), payment, [])).toEqual({ kind: "underpaid" });
    expect(judgeSubmitted(tx("2000000000"), payment, [])).toEqual({ kind: "overpaid" });
  });

  it("refuses a transaction that is someone else's, too old or unrelated", () => {
    expect(judgeSubmitted(tx("1250004200"), payment, [BigInt("1250004200")]).kind).toBe("reject");
    expect(judgeSubmitted(tx("1250003700", t0 - 86_400_000), payment, []).kind).toBe("reject");
    expect(judgeSubmitted(tx("5000000"), payment, []).kind).toBe("reject");
    // even the exact amount does not help an old transaction
    expect(judgeSubmitted(tx("1250003700", t0 - 600_000), payment, []).kind).toBe("reject");
  });

  it("reports paid only at the required confirmations", () => {
    expect(progress(0, 2)).toBe("detected");
    expect(progress(1, 2)).toBe("confirming");
    expect(progress(2, 2)).toBe("confirmed");
    expect(progress(19, 20)).toBe("confirming");
    expect(progress(25, 20)).toBe("confirmed");
  });
});
