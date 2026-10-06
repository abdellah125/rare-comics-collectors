import "server-only";
import type { ChainFamily, CryptoAsset } from "@/lib/crypto-payments/assets";
import { evmAdapter } from "@/lib/crypto-payments/chains/evm";
import { solanaAdapter } from "@/lib/crypto-payments/chains/solana";
import { tronAdapter } from "@/lib/crypto-payments/chains/tron";
import type { ChainAdapter, Transfer } from "@/lib/crypto-payments/chains/types";
import { bitcoinAdapter, litecoinAdapter } from "@/lib/crypto-payments/chains/utxo";

const ADAPTERS: Record<ChainFamily, ChainAdapter> = { evm: evmAdapter, tron: tronAdapter, solana: solanaAdapter, bitcoin: bitcoinAdapter, litecoin: litecoinAdapter };

export const adapterFor = (asset: CryptoAsset): ChainAdapter => ADAPTERS[asset.family];

/** Whether payments in this asset are found without the buyer giving a transaction hash. */
export const detectsAutomatically = (asset: CryptoAsset): boolean => adapterFor(asset).canList(asset);

/**
 * How often one address may be listed. Every open payment in an asset reads the same list, so
 * it is kept for a few seconds per server instance; Litecoin's public API allows the fewest calls.
 */
const LIST_TTL_MS: Record<ChainFamily, number> = { evm: 15_000, tron: 15_000, solana: 20_000, bitcoin: 15_000, litecoin: 45_000 };
const lists = new Map<string, { at: number; sinceMs: number; transfers: Transfer[] }>();

export async function listIncoming(asset: CryptoAsset, sinceMs: number): Promise<Transfer[]> {
  const key = `${asset.coin}:${asset.network}`;
  const hit = lists.get(key);
  if (hit && Date.now() - hit.at < LIST_TTL_MS[asset.family] && hit.sinceMs <= sinceMs) return hit.transfers.filter((t) => t.timeMs === null || t.timeMs >= sinceMs);
  const transfers = await adapterFor(asset).listIncoming(asset, sinceMs);
  lists.set(key, { at: Date.now(), sinceMs, transfers });
  return transfers;
}

export const lookupTransfer = (asset: CryptoAsset, txHash: string): Promise<Transfer | null> => adapterFor(asset).lookup(asset, txHash);

export type { Transfer };

/** Drops the remembered lists, so the next check reads the chain again (staff "check now", tests). */
export function forgetLists(): void {
  lists.clear();
}
