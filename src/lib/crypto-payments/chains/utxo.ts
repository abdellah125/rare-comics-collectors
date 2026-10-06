import "server-only";
import type { CryptoAsset } from "@/lib/crypto-payments/assets";
import { chainJson, endpoints, firstOf, type ChainAdapter, type Transfer } from "@/lib/crypto-payments/chains/types";

/**
 * Bitcoin, through the Esplora API that mempool.space and blockstream.info both serve
 * (public, no key). BITCOIN_API_URL can point at another Esplora server.
 */
type EsploraTx = { txid: string; vout: { scriptpubkey_address?: string; value: number }[]; status: { confirmed: boolean; block_height?: number; block_time?: number } };

const btcHosts = () => endpoints(process.env.BITCOIN_API_URL, ["https://mempool.space/api", "https://blockstream.info/api"]);

function fromEsplora(tx: EsploraTx, address: string, tip: number): Transfer | null {
  const amount = tx.vout.filter((o) => o.scriptpubkey_address === address).reduce((n, o) => n + BigInt(o.value), BigInt(0));
  if (amount <= BigInt(0)) return null;
  const confirmed = tx.status.confirmed && typeof tx.status.block_height === "number";
  return { txHash: tx.txid.toLowerCase(), amount, confirmations: confirmed ? Math.max(1, tip - tx.status.block_height! + 1) : 0, timeMs: confirmed && tx.status.block_time ? tx.status.block_time * 1000 : null };
}

export const bitcoinAdapter: ChainAdapter = {
  canList: () => true,
  async listIncoming(asset: CryptoAsset, sinceMs: number) {
    return firstOf(btcHosts(), async (host) => {
      // Unconfirmed transactions plus the 25 most recent confirmed ones.
      const [txs, tip] = await Promise.all([chainJson<EsploraTx[] | null>(`${host}/address/${asset.address}/txs`), chainJson<number>(`${host}/blocks/tip/height`)]);
      return (txs ?? []).map((tx) => fromEsplora(tx, asset.address, Number(tip))).filter((t): t is Transfer => t !== null && (t.timeMs === null || t.timeMs >= sinceMs));
    });
  },
  async lookup(asset: CryptoAsset, txHash: string) {
    return firstOf(btcHosts(), async (host) => {
      const tx = await chainJson<EsploraTx | null>(`${host}/tx/${txHash}`);
      if (!tx) return null;
      const tip = await chainJson<number>(`${host}/blocks/tip/height`);
      return fromEsplora(tx, asset.address, Number(tip));
    });
  },
};

/**
 * Litecoin, through BlockCypher (public; BLOCKCYPHER_TOKEN raises its hourly limit and is sent
 * only from the server).
 */
type CypherTx = { hash: string; confirmations?: number; confirmed?: string; outputs?: { value: number; addresses?: string[] | null }[] };

const CYPHER = "https://api.blockcypher.com/v1/ltc/main";
const cypherUrl = (path: string, query: string) => `${CYPHER}${path}?${query}${process.env.BLOCKCYPHER_TOKEN ? `&token=${encodeURIComponent(process.env.BLOCKCYPHER_TOKEN)}` : ""}`;

function fromCypher(tx: CypherTx, address: string): Transfer | null {
  const amount = (tx.outputs ?? []).filter((o) => o.addresses?.length === 1 && o.addresses[0] === address).reduce((n, o) => n + BigInt(o.value), BigInt(0));
  if (amount <= BigInt(0)) return null;
  const confirmations = Math.max(0, tx.confirmations ?? 0);
  const time = confirmations > 0 && tx.confirmed ? Date.parse(tx.confirmed) : NaN;
  return { txHash: tx.hash.toLowerCase(), amount, confirmations, timeMs: Number.isFinite(time) ? time : null };
}

export const litecoinAdapter: ChainAdapter = {
  canList: () => true,
  async listIncoming(asset: CryptoAsset, sinceMs: number) {
    const body = await chainJson<{ txs?: CypherTx[] } | null>(cypherUrl(`/addrs/${asset.address}/full`, "limit=50&txlimit=50"));
    return (body?.txs ?? []).map((tx) => fromCypher(tx, asset.address)).filter((t): t is Transfer => t !== null && (t.timeMs === null || t.timeMs >= sinceMs));
  },
  async lookup(asset: CryptoAsset, txHash: string) {
    const tx = await chainJson<CypherTx | null>(cypherUrl(`/txs/${txHash}`, "limit=200"));
    return tx && tx.hash ? fromCypher(tx, asset.address) : null;
  },
};
