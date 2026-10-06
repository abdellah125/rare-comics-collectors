import "server-only";
import type { CryptoAsset } from "@/lib/crypto-payments/assets";
import { ChainError, chainJson, endpoints, firstOf, type ChainAdapter, type Transfer } from "@/lib/crypto-payments/chains/types";

/**
 * Solana (SPL tokens), over JSON-RPC. The public endpoint answers without a key but limits
 * requests and sometimes refuses cloud servers: SOLANA_RPC_URL (server-side only) should point
 * at a provider of your own for dependable automatic detection.
 */
const hosts = () => endpoints(process.env.SOLANA_RPC_URL, ["https://api.mainnet-beta.solana.com"]);
/** Signatures examined per address on one listing, and the pause between reading two transactions. */
const SCAN = 10;
const PACE_MS = 200;

type TokenBalance = { mint: string; owner?: string; uiTokenAmount: { amount: string } };
type SolTx = { blockTime?: number | null; meta?: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null } | null;
type SigInfo = { signature: string; err: unknown; blockTime?: number | null; confirmationStatus?: string };
type SigStatus = { confirmations: number | null; confirmationStatus?: string; err: unknown } | null;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const body = await chainJson<{ result?: T; error?: { message?: string } } | null>(url, { body: { jsonrpc: "2.0", id: 1, method, params } });
  if (!body || body.error) throw new ChainError(`${new URL(url).host}: ${String(body?.error?.message ?? "no answer").slice(0, 120)}`);
  return body.result as T;
}

/** What the wallet's balance of this token grew by in the transaction. */
function received(tx: NonNullable<SolTx>, asset: CryptoAsset): bigint {
  const sum = (rows: TokenBalance[] | undefined) => (rows ?? []).filter((b) => b.mint === asset.contract && b.owner === asset.address).reduce((n, b) => n + BigInt(b.uiTokenAmount.amount), BigInt(0));
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

const confirmationsOf = (status: string | undefined, counted: number | null | undefined, required: number) => (status === "finalized" ? required : Math.max(1, Math.min(required - 1, counted ?? 1)));

async function read(url: string, asset: CryptoAsset, signature: string, known?: string): Promise<Transfer | null> {
  const tx = await rpc<SolTx>(url, "getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
  if (!tx || !tx.meta || tx.meta.err) return null;
  const amount = received(tx, asset);
  if (amount <= BigInt(0)) return null;
  const timeMs = tx.blockTime ? tx.blockTime * 1000 : null;
  // A listing already says whether the transaction is finalized; a lookup by hash asks.
  if (known) return { txHash: signature, amount, confirmations: confirmationsOf(known, null, asset.confirmations), timeMs };
  const statuses = await rpc<{ value: SigStatus[] }>(url, "getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
  const st = statuses.value[0];
  if (!st || st.err) return null;
  return { txHash: signature, amount, confirmations: confirmationsOf(st.confirmationStatus, st.confirmations, asset.confirmations), timeMs };
}

// Transactions already read on this server instance: a finalized one never changes.
const seen = new Map<string, Transfer | null>();

export const solanaAdapter: ChainAdapter = {
  canList: () => true,
  async listIncoming(asset: CryptoAsset, sinceMs: number) {
    return firstOf(hosts(), async (url) => {
      // Token transfers reference the wallet's token account, not the wallet itself; a first
      // transfer creates that account and references the wallet. Both are watched.
      const accounts = await rpc<{ value: { pubkey: string }[] }>(url, "getTokenAccountsByOwner", [asset.address, { mint: asset.contract }, { encoding: "jsonParsed" }]);
      const watch = [...new Set([...accounts.value.map((a) => a.pubkey), asset.address])];
      const sigs = new Map<string, SigInfo>();
      for (const address of watch) {
        for (const s of await rpc<SigInfo[]>(url, "getSignaturesForAddress", [address, { limit: SCAN, commitment: "confirmed" }])) {
          if (!s.err && (!s.blockTime || s.blockTime * 1000 >= sinceMs)) sigs.set(s.signature, s);
        }
      }
      const out: Transfer[] = [];
      const newest = [...sigs.values()].sort((a, b) => (b.blockTime ?? Infinity) - (a.blockTime ?? Infinity)).slice(0, SCAN);
      for (const s of newest) {
        const key = `${asset.contract}:${asset.address}:${s.signature}`;
        let t = seen.get(key);
        if (t === undefined || (t && t.confirmations < asset.confirmations)) {
          await new Promise((r) => setTimeout(r, PACE_MS));
          t = await read(url, asset, s.signature, s.confirmationStatus ?? "confirmed");
          if (seen.size > 2_000) seen.clear();
          seen.set(key, t);
        }
        if (t) out.push(t);
      }
      return out.sort((a, b) => (b.timeMs ?? Infinity) - (a.timeMs ?? Infinity));
    });
  },
  lookup: (asset, txHash) => firstOf(hosts(), (url) => read(url, asset, txHash)),
};
