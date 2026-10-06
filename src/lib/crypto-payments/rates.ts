import "server-only";
import type { CoinId } from "@/lib/crypto-payments/assets";

/**
 * US-dollar prices for the accepted coins, read on the server from two public market-data
 * services (Coinbase and CoinGecko; neither needs a key). A price is used only when the two
 * agree within 3 %, or when one of them is unreachable and the other answers. USDT is quoted
 * 1:1 with the dollar and is withdrawn if the market says it has lost its peg.
 */
export type Rate = { coin: CoinId; usd: string; source: string; at: number };

const TTL_MS = 60_000;
/** When neither source answers, wait this long before asking again, so the checkout is not slowed on every request. */
const EMPTY_TTL_MS = 20_000;
const TIMEOUT_MS = 4_000;
const MAX_DISAGREEMENT = 0.03;
const USDT_PEG_TOLERANCE = 0.02;
const COINGECKO_IDS: Record<CoinId, string> = { BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", LTC: "litecoin", USDT: "tether" };
const COINS = Object.keys(COINGECKO_IDS) as CoinId[];

let cache: { at: number; rates: Partial<Record<CoinId, Rate>> } | null = null;
let inflight: Promise<Partial<Record<CoinId, Rate>>> | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const positive = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function fromCoinbase(): Promise<Partial<Record<CoinId, number>>> {
  const out: Partial<Record<CoinId, number>> = {};
  await Promise.all(
    COINS.map(async (coin) => {
      try {
        const body = (await getJson(`https://api.coinbase.com/v2/prices/${coin}-USD/spot`)) as { data?: { amount?: string } };
        const n = positive(body.data?.amount);
        if (n) out[coin] = n;
      } catch {
        // this coin is simply missing from this source
      }
    }),
  );
  return out;
}

async function fromCoinGecko(): Promise<Partial<Record<CoinId, number>>> {
  const out: Partial<Record<CoinId, number>> = {};
  try {
    const body = (await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINGECKO_IDS).join(",")}&vs_currencies=usd`)) as Record<string, { usd?: number }>;
    for (const coin of COINS) {
      const n = positive(body[COINGECKO_IDS[coin]]?.usd);
      if (n) out[coin] = n;
    }
  } catch {
    // source unavailable
  }
  return out;
}

/** Pure: one coin's usable price from the two sources, or null when it cannot be trusted. */
export function reconcileRate(coin: CoinId, a: number | undefined, b: number | undefined): { usd: string; source: string } | null {
  if (coin === "USDT") {
    const seen = [a, b].filter((v): v is number => v !== undefined);
    // No market reading at all, or a broken peg: do not quote.
    if (seen.length === 0 || seen.some((v) => Math.abs(v - 1) > USDT_PEG_TOLERANCE)) return null;
    return { usd: "1", source: "1 USDT = 1 USD (peg checked)" };
  }
  if (a !== undefined && b !== undefined) {
    if (Math.abs(a - b) / Math.min(a, b) > MAX_DISAGREEMENT) return null;
    return { usd: String(a), source: "Coinbase (checked against CoinGecko)" };
  }
  if (a !== undefined) return { usd: String(a), source: "Coinbase" };
  if (b !== undefined) return { usd: String(b), source: "CoinGecko" };
  return null;
}

async function load(): Promise<Partial<Record<CoinId, Rate>>> {
  const [cb, cg] = await Promise.all([fromCoinbase(), fromCoinGecko()]);
  const at = Date.now();
  const rates: Partial<Record<CoinId, Rate>> = {};
  for (const coin of COINS) {
    const r = reconcileRate(coin, cb[coin], cg[coin]);
    if (r) rates[coin] = { coin, ...r, at };
  }
  return rates;
}

/** Current prices; coins without a trustworthy price are absent. Cached for a minute. */
export async function getRates(): Promise<Partial<Record<CoinId, Rate>>> {
  if (cache && Date.now() - cache.at < (Object.keys(cache.rates).length > 0 ? TTL_MS : EMPTY_TTL_MS)) return cache.rates;
  if (!inflight) {
    inflight = load()
      .then((rates) => {
        cache = { at: Date.now(), rates };
        return rates;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** A fresh price for one coin at the moment an amount is locked. */
export async function getRate(coin: CoinId): Promise<Rate | null> {
  return (await getRates())[coin] ?? null;
}

