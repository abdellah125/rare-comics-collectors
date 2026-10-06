import "server-only";
import type { CryptoAsset, NetworkId } from "@/lib/crypto-payments/assets";
import { ChainError, chainJson, endpoints, firstOf, type ChainAdapter, type Transfer } from "@/lib/crypto-payments/chains/types";

/**
 * Ethereum and BNB Smart Chain, read over JSON-RPC from public nodes (no key). ETH_RPC_URL and
 * BSC_RPC_URL can point at your own provider.
 *
 * Tokens (USDT, LTC on BSC): incoming transfers are found from the token's Transfer logs.
 * Native coins (ETH, BNB): a node cannot list the transactions of an address, so automatic
 * detection needs an indexer. With ETHERSCAN_API_KEY set (server-side only) the Etherscan
 * account API is used; without it the buyer gives the transaction hash, which is then verified
 * on chain like any other.
 */
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_SELECTOR = "0xa9059cbb";
/** Largest block span one eth_getLogs call asks for, and how many calls one listing may make. */
const LOG_SPAN = 4_000;
const LOG_CALLS = 6;

const CHAIN: Partial<Record<NetworkId, { id: number; rpc: () => string[] }>> = {
  ETHEREUM: { id: 1, rpc: () => endpoints(process.env.ETH_RPC_URL, ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"]) },
  BSC: { id: 56, rpc: () => endpoints(process.env.BSC_RPC_URL, ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"]) },
};

type RpcTx = { hash: string; to: string | null; value: string; input: string; blockNumber: string | null };
type RpcLog = { address: string; topics: string[]; data: string; transactionHash: string; blockNumber: string; removed?: boolean };
type RpcReceipt = { status: string; blockNumber: string; logs: RpcLog[] };
type RpcBlock = { number: string; timestamp: string };

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const body = await chainJson<{ result?: T; error?: { message?: string } } | null>(url, { body: { jsonrpc: "2.0", id: 1, method, params } });
  if (!body || body.error) throw new ChainError(`${new URL(url).host}: ${String(body?.error?.message ?? "no answer").slice(0, 120)}`);
  return body.result as T;
}

const hex = (n: number | bigint) => `0x${n.toString(16)}`;
const num = (h: string) => Number(BigInt(h));
const topicOf = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
const same = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();
const big = (h: string) => (h && h !== "0x" ? BigInt(h) : BigInt(0));

function chainOf(asset: CryptoAsset) {
  const c = CHAIN[asset.network];
  if (!c) throw new ChainError(`${asset.network} is not an EVM network`);
  return c;
}

/** Sum of this token's Transfer logs that credit our address. */
function tokenAmount(logs: RpcLog[], asset: CryptoAsset): bigint {
  const to = topicOf(asset.address);
  return logs.filter((l) => !l.removed && same(l.address, asset.contract!) && l.topics.length === 3 && l.topics[0] === TRANSFER_TOPIC && l.topics[2].toLowerCase() === to).reduce((n, l) => n + big(l.data), BigInt(0));
}

/** Block time in milliseconds, measured from the chain itself (it has changed more than once on BSC). */
async function clock(url: string): Promise<{ latest: number; latestMs: number; blockMs: number }> {
  const head = await rpc<RpcBlock>(url, "eth_getBlockByNumber", ["latest", false]);
  const latest = num(head.number);
  const back = await rpc<RpcBlock>(url, "eth_getBlockByNumber", [hex(Math.max(0, latest - 1000)), false]);
  const span = latest - num(back.number);
  const blockMs = span > 0 ? Math.max(100, ((num(head.timestamp) - num(back.timestamp)) * 1000) / span) : 12_000;
  return { latest, latestMs: num(head.timestamp) * 1000, blockMs };
}

async function listTokenTransfers(asset: CryptoAsset, sinceMs: number): Promise<Transfer[]> {
  return firstOf(chainOf(asset).rpc(), async (url) => {
    const { latest, latestMs, blockMs } = await clock(url);
    const wanted = Math.ceil(Math.max(0, latestMs - sinceMs) / blockMs) + 50;
    const span = Math.min(wanted, LOG_SPAN * LOG_CALLS);
    const out = new Map<string, Transfer>();
    for (let to = latest; to > latest - span; to -= LOG_SPAN) {
      const from = Math.max(latest - span + 1, to - LOG_SPAN + 1);
      const logs = await rpc<RpcLog[]>(url, "eth_getLogs", [{ address: asset.contract, topics: [TRANSFER_TOPIC, null, topicOf(asset.address)], fromBlock: hex(from), toBlock: hex(to) }]);
      for (const l of logs) {
        if (l.removed) continue;
        const bn = num(l.blockNumber);
        const txHash = l.transactionHash.toLowerCase();
        const prev = out.get(txHash);
        out.set(txHash, { txHash, amount: (prev?.amount ?? BigInt(0)) + big(l.data), confirmations: Math.max(1, latest - bn + 1), timeMs: Math.round(latestMs - (latest - bn) * blockMs) });
      }
    }
    return [...out.values()].sort((a, b) => (b.timeMs ?? Infinity) - (a.timeMs ?? Infinity));
  });
}

type ScanTx = { hash: string; to: string; value: string; timeStamp: string; confirmations: string; isError: string };

async function listNativeTransfers(asset: CryptoAsset, sinceMs: number): Promise<Transfer[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new ChainError("Incoming ETH and BNB cannot be listed without an indexer key");
  const url = `https://api.etherscan.io/v2/api?chainid=${chainOf(asset).id}&module=account&action=txlist&address=${asset.address}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${encodeURIComponent(key)}`;
  const body = await chainJson<{ status?: string; message?: string; result?: ScanTx[] | string } | null>(url);
  if (!body || !Array.isArray(body.result)) {
    // "No transactions found" is an empty list, not a failure.
    if (body?.message && /no transactions/i.test(body.message)) return [];
    throw new ChainError(`api.etherscan.io: ${String(typeof body?.result === "string" ? body.result : (body?.message ?? "no answer")).slice(0, 120)}`);
  }
  return body.result
    .filter((t) => t.isError === "0" && same(t.to, asset.address) && BigInt(t.value) > BigInt(0))
    .map((t) => ({ txHash: t.hash.toLowerCase(), amount: BigInt(t.value), confirmations: Math.max(1, Number(t.confirmations) || 1), timeMs: Number(t.timeStamp) * 1000 }))
    .filter((t) => t.timeMs >= sinceMs);
}

export const evmAdapter: ChainAdapter = {
  canList: (asset) => asset.kind === "token" || Boolean(process.env.ETHERSCAN_API_KEY),
  listIncoming: (asset, sinceMs) => (asset.kind === "token" ? listTokenTransfers(asset, sinceMs) : listNativeTransfers(asset, sinceMs)),
  async lookup(asset, txHash) {
    return firstOf(chainOf(asset).rpc(), async (url) => {
      const tx = await rpc<RpcTx | null>(url, "eth_getTransactionByHash", [txHash]);
      if (!tx) return null;
      const hash = tx.hash.toLowerCase();
      if (!tx.blockNumber) {
        // Still in the mempool: readable from the transaction itself, nothing is final yet.
        if (asset.kind === "native") return same(tx.to, asset.address) && big(tx.value) > BigInt(0) ? { txHash: hash, amount: big(tx.value), confirmations: 0, timeMs: null } : null;
        const input = tx.input.toLowerCase();
        if (!same(tx.to, asset.contract!) || !input.startsWith(TRANSFER_SELECTOR) || input.length < 138) return null;
        if (`0x${input.slice(34, 74)}` !== asset.address.toLowerCase()) return null;
        return { txHash: hash, amount: BigInt(`0x${input.slice(74, 138)}`), confirmations: 0, timeMs: null };
      }
      const [receipt, head] = await Promise.all([rpc<RpcReceipt | null>(url, "eth_getTransactionReceipt", [txHash]), rpc<string>(url, "eth_blockNumber", [])]);
      if (!receipt || receipt.status !== "0x1") return null;
      const amount = asset.kind === "native" ? (same(tx.to, asset.address) ? big(tx.value) : BigInt(0)) : tokenAmount(receipt.logs, asset);
      if (amount <= BigInt(0)) return null;
      const block = await rpc<RpcBlock | null>(url, "eth_getBlockByNumber", [receipt.blockNumber, false]);
      // A mined transaction always has a block time; without it its age cannot be checked.
      if (!block) throw new ChainError(`${new URL(url).host} did not return the transaction's block`);
      return { txHash: hash, amount, confirmations: Math.max(1, num(head) - num(receipt.blockNumber) + 1), timeMs: num(block.timestamp) * 1000 };
    });
  },
};
