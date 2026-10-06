import type { CryptoAsset } from "@/lib/crypto-payments/assets";

/** Money that arrived at the receiving address of one asset, as the blockchain records it. */
export type Transfer = {
  txHash: string;
  /** on-chain units received by our address in this transaction, for this asset only */
  amount: bigint;
  /** 0 while the transaction is not yet in a block */
  confirmations: number;
  /** block time, or null while unconfirmed */
  timeMs: number | null;
};

/**
 * Read-only access to one kind of blockchain. Adapters never sign or send anything: they only
 * read public data, on the server.
 */
export interface ChainAdapter {
  /** Whether recent incoming transfers can be listed for this asset with the current configuration. */
  canList(asset: CryptoAsset): boolean;
  /** Incoming transfers of this asset to its receiving address since `sinceMs`, newest first. */
  listIncoming(asset: CryptoAsset, sinceMs: number): Promise<Transfer[]>;
  /**
   * What one transaction paid to the receiving address in this asset. Null when the transaction
   * does not exist, failed, or did not pay this address in this asset.
   */
  lookup(asset: CryptoAsset, txHash: string): Promise<Transfer | null>;
}

export class ChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainError";
  }
}

const TIMEOUT_MS = 9_000;

/** GET or POST JSON with a timeout. API keys travel in headers set by the caller and are never logged. */
export async function chainJson<T>(url: string, init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: { accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    // The host only: a full URL can carry a key in its path or query.
    throw new ChainError(`${hostOf(url)} unreachable (${err instanceof Error ? err.name : "error"})`);
  }
  if (res.status === 404) return null as T;
  if (!res.ok) throw new ChainError(`${hostOf(url)} answered ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ChainError(`${hostOf(url)} sent an unreadable answer`);
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "blockchain API";
  }
}

/** Tries each endpoint in turn and returns the first answer; throws the last error when all fail. */
export async function firstOf<T>(urls: string[], run: (url: string) => Promise<T>): Promise<T> {
  let last: unknown = new ChainError("No blockchain API configured");
  for (const url of urls) {
    try {
      return await run(url);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/** Comma-separated endpoints from the environment, or the defaults. */
export function endpoints(envValue: string | undefined, defaults: string[]): string[] {
  const own = (envValue ?? "").split(",").map((s) => s.trim()).filter((s) => /^https:\/\//.test(s));
  return own.length > 0 ? own : defaults;
}
