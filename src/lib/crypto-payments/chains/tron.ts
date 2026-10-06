import "server-only";
import { createHash } from "node:crypto";
import type { CryptoAsset } from "@/lib/crypto-payments/assets";
import { ChainError, chainJson, endpoints, firstOf, type ChainAdapter } from "@/lib/crypto-payments/chains/types";

/**
 * Tron (TRC-20 tokens), through the TronGrid HTTP API. It answers without a key at a low rate;
 * TRONGRID_API_KEY (server-side only) raises the limit. TRON_API_URL can point elsewhere.
 */
const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BLOCK_MS = 3_000;
const hosts = () => endpoints(process.env.TRON_API_URL, ["https://api.trongrid.io"]);
const headers = (): Record<string, string> => (process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : {});

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** A Tron address ("T…") as the 20-byte hex the contract logs use. Throws on a bad checksum. */
export function tronAddressToHex(address: string): string {
  let n = BigInt(0);
  for (const ch of address) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new ChainError("Invalid Tron address");
    n = n * BigInt(58) + BigInt(i);
  }
  const bytes = Buffer.from(n.toString(16).padStart(50, "0"), "hex");
  if (bytes.length !== 25 || bytes[0] !== 0x41) throw new ChainError("Invalid Tron address");
  const check = createHash("sha256").update(createHash("sha256").update(bytes.subarray(0, 21)).digest()).digest().subarray(0, 4);
  if (!check.equals(bytes.subarray(21))) throw new ChainError("Invalid Tron address checksum");
  return bytes.subarray(1, 21).toString("hex");
}

type Trc20Row = { transaction_id: string; value: string; block_timestamp: number; to: string; token_info?: { address?: string } };
type TxInfo = { id?: string; blockNumber?: number; blockTimeStamp?: number; receipt?: { result?: string }; log?: { address: string; topics: string[]; data: string }[] };
type NowBlock = { block_header?: { raw_data?: { number?: number } } };

export const tronAdapter: ChainAdapter = {
  canList: () => true,
  async listIncoming(asset: CryptoAsset, sinceMs: number) {
    return firstOf(hosts(), async (host) => {
      const url = `${host}/v1/accounts/${asset.address}/transactions/trc20?only_to=true&limit=50&contract_address=${asset.contract}&min_timestamp=${Math.max(0, Math.floor(sinceMs))}`;
      const body = await chainJson<{ data?: Trc20Row[]; success?: boolean } | null>(url, { headers: headers() });
      if (!body || body.success === false || !Array.isArray(body.data)) throw new ChainError("api.trongrid.io sent no transfer list");
      const now = Date.now();
      return body.data
        .filter((r) => r.to === asset.address && r.token_info?.address === asset.contract && /^\d+$/.test(r.value))
        // The list carries no block height: confirmations are estimated from the block time here and
        // read exactly by lookup() once a transfer has been matched to an order.
        .map((r) => ({ txHash: r.transaction_id.toLowerCase(), amount: BigInt(r.value), confirmations: Math.max(1, Math.min(asset.confirmations - 1, Math.floor((now - r.block_timestamp) / BLOCK_MS))), timeMs: r.block_timestamp }));
    });
  },
  async lookup(asset: CryptoAsset, txHash: string) {
    return firstOf(hosts(), async (host) => {
      const info = await chainJson<TxInfo | null>(`${host}/wallet/gettransactioninfobyid`, { body: { value: txHash }, headers: headers() });
      // An empty object means the transaction is unknown or not yet in a block.
      if (!info || !info.id || typeof info.blockNumber !== "number") return null;
      if (info.receipt?.result !== "SUCCESS") return null;
      const contract = tronAddressToHex(asset.contract!);
      const to = tronAddressToHex(asset.address);
      const amount = (info.log ?? [])
        .filter((l) => l.address.toLowerCase() === contract && l.topics.length === 3 && l.topics[0].toLowerCase() === TRANSFER_TOPIC && l.topics[2].toLowerCase().slice(-40) === to)
        .reduce((n, l) => n + (l.data ? BigInt(`0x${l.data}`) : BigInt(0)), BigInt(0));
      if (amount <= BigInt(0)) return null;
      const head = await chainJson<NowBlock | null>(`${host}/wallet/getnowblock`, { method: "POST", headers: headers() });
      const latest = head?.block_header?.raw_data?.number;
      if (typeof latest !== "number") throw new ChainError("api.trongrid.io did not report the current block");
      return { txHash: info.id.toLowerCase(), amount, confirmations: Math.max(1, latest - info.blockNumber + 1), timeMs: info.blockTimeStamp ?? null };
    });
  },
};
