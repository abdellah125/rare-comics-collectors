/**
 * Live, read-only check of the blockchain readers: for each kind of chain, list recent incoming
 * transfers to a busy public address and read one of them back by its hash. Both readings must
 * agree. The store's own addresses are also listed (they may simply be empty).
 *
 *   npx tsx --conditions=react-server tests/integration/crypto-chains.ts
 *
 * Needs network access; public APIs rate-limit, so a "skipped" line is not a failure.
 */
import { allAssets, getAsset, type CryptoAsset } from "@/lib/crypto-payments/assets";
import { adapterFor } from "@/lib/crypto-payments/chains";
import { receivedDecimal } from "@/lib/crypto-payments/amounts";

const busy: Record<string, string> = {
  "USDT:ETHEREUM": "0x28C6c06298d514Db089934071355E5743bf21d60",
  "USDT:BSC": process.env.BSC_BUSY ?? "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
  "USDT:TRON": process.env.TRON_BUSY ?? "TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G",
  "USDT:SOLANA": process.env.SOL_BUSY ?? "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  "BTC:BITCOIN": "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h",
  "LTC:LITECOIN": process.env.LTC_BUSY ?? "",
  "LTC:BSC": "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
  "ETH:ETHEREUM": process.env.ETH_TO ?? "0x28C6c06298d514Db089934071355E5743bf21d60",
  "BNB:BSC": process.env.BNB_TO ?? "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3",
};
/** A known transaction for assets whose incoming transfers cannot be listed without a key. */
const knownTx: Record<string, string> = { "ETH:ETHEREUM": process.env.ETH_TX ?? "", "BNB:BSC": process.env.BNB_TX ?? "" };

/** Public APIs allow only a request or two per second without a key. */
const pause = () => new Promise((r) => setTimeout(r, Number(process.env.PAUSE_MS ?? 1500)));
let failed = 0;
const line = (ok: boolean | null, text: string) => {
  if (ok === false) failed += 1;
  console.log(`${ok === null ? "SKIP" : ok ? "PASS" : "FAIL"} ${text}`);
};

async function main() {
  for (const asset of allAssets()) {
    const key = `${asset.coin}:${asset.network}`;
    if (process.env.ONLY && !process.env.ONLY.split(",").includes(key)) continue;
    const adapter = adapterFor(asset);
    await pause();
    // 1. The store's own address answers (an empty list is fine).
    if (adapter.canList(asset)) {
      try {
        const own = await adapter.listIncoming(asset, Date.now() - 3_600_000);
        line(true, `${key} own address ${asset.address}: ${own.length} transfer(s) in the last hour`);
      } catch (err) {
        line(null, `${key} own address: ${err instanceof Error ? err.message : err}`);
      }
    } else line(null, `${key} own address: listing needs an indexer key; buyers give the transaction hash`);

    // 2. A busy address: list, then read one transfer back by hash.
    const address = busy[key];
    if (!address) {
      line(null, `${key} busy address: none configured`);
      continue;
    }
    const probe: CryptoAsset = { ...asset, address };
    await pause();
    try {
      let hash = knownTx[key];
      let listed: bigint | null = null;
      if (adapter.canList(probe)) {
        const list = await adapter.listIncoming(probe, Date.now() - 2 * 3_600_000);
        const pick = list.find((t) => t.confirmations > 0) ?? list[0];
        if (!pick) {
          line(null, `${key} busy address: no recent transfer to compare`);
          continue;
        }
        hash = pick.txHash;
        listed = pick.amount;
        line(true, `${key} list: ${list.length} transfer(s), e.g. ${receivedDecimal(pick.amount, asset.decimals, 2)} ${asset.coin}, ${pick.confirmations} conf, ${pick.timeMs ? new Date(pick.timeMs).toISOString() : "unconfirmed"}`);
      }
      if (!hash) {
        line(null, `${key} lookup: no transaction hash to try`);
        continue;
      }
      await pause();
      const one = await adapter.lookup(probe, hash);
      if (!one) line(false, `${key} lookup ${hash}: not found`);
      else if (listed !== null && one.amount !== listed) line(false, `${key} lookup ${hash}: ${one.amount} differs from the listed ${listed}`);
      else line(true, `${key} lookup ${hash.slice(0, 18)}…: ${receivedDecimal(one.amount, asset.decimals, 2)} ${asset.coin}, ${one.confirmations} conf`);
      // 3. The same transaction must not count for an address it did not pay.
      const other = await adapter.lookup(asset, hash);
      line(other === null, `${key} the same transaction pays nothing to the store's address`);
    } catch (err) {
      line(null, `${key} busy address: ${err instanceof Error ? err.message : err}`);
    }
  }
  // An unknown pair never resolves to another one.
  line(getAsset("USDT", "BITCOIN") === null && getAsset("BTC", "TRON") === null, "unknown coin/network pairs are refused");
  console.log(failed === 0 ? "\nno failures" : `\n${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}
void main();
