/**
 * Cryptocurrencies the store accepts, and where each one is received.
 *
 * One entry per coin and network. Everything a payment needs comes from the entry that was
 * selected: the receiving address, the token contract, the decimals and the confirmations to
 * wait for. Nothing is ever looked up by coin alone, so a TRC-20 payment can only ever be shown
 * the Tron address, and an unavailable network is refused instead of being swapped for another.
 *
 * The addresses are receiving addresses. The site holds no private key or seed phrase and
 * never needs one: it only reads public blockchain data to see what arrived.
 */
export type CoinId = "USDT" | "BTC" | "BNB" | "ETH" | "LTC";
export type NetworkId = "BSC" | "ETHEREUM" | "SOLANA" | "TRON" | "BITCOIN" | "LITECOIN";
/** Which kind of chain API reads this network. */
export type ChainFamily = "evm" | "tron" | "solana" | "bitcoin" | "litecoin";

export type CryptoAsset = {
  coin: CoinId;
  network: NetworkId;
  family: ChainFamily;
  /** Network name as shown to the buyer, e.g. "Tron (TRC-20)". */
  networkLabel: string;
  /** Short form for summaries, e.g. "TRC-20". */
  networkShort: string;
  /** Receiving address for exactly this coin on exactly this network. */
  address: string;
  /** "native" = the chain's own coin; "token" = a token contract on the chain. */
  kind: "native" | "token";
  /** Token contract (EVM, Tron) or mint (Solana); absent for native coins. */
  contract?: string;
  /** Decimals of the smallest on-chain unit. */
  decimals: number;
  /** Decimals the price is rounded up to; two more are added to tell orders apart. */
  quoteDecimals: number;
  /** Confirmations before an order is marked paid. */
  confirmations: number;
  /** Shown next to the network when the asset is not what its ticker suggests. */
  note?: string;
  /** Address of a transaction on a public explorer. */
  explorerTx: string;
};

type NetworkConfig = Omit<CryptoAsset, "coin" | "network">;
export type CoinConfig = { name: string; networks: Partial<Record<NetworkId, NetworkConfig>> };

const EVM_ADDRESS = "0x7DA32E72a89ee85529cf28530998236a21a9D8a9";

export const CRYPTO: Record<CoinId, CoinConfig> = {
  USDT: {
    name: "Tether (USDT)",
    networks: {
      BSC: { family: "evm", networkLabel: "BNB Smart Chain (BEP-20)", networkShort: "BEP-20", address: EVM_ADDRESS, kind: "token", contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, quoteDecimals: 2, confirmations: 15, explorerTx: "https://bscscan.com/tx/" },
      ETHEREUM: { family: "evm", networkLabel: "Ethereum (ERC-20)", networkShort: "ERC-20", address: EVM_ADDRESS, kind: "token", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, quoteDecimals: 2, confirmations: 12, explorerTx: "https://etherscan.io/tx/" },
      SOLANA: { family: "solana", networkLabel: "Solana", networkShort: "Solana", address: "DURksVqkbWDUjRp4oRkTrvvG3P4XipMF3KB4Mnm2Mmt8", kind: "token", contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, quoteDecimals: 2, confirmations: 32, explorerTx: "https://solscan.io/tx/" },
      TRON: { family: "tron", networkLabel: "Tron (TRC-20)", networkShort: "TRC-20", address: "TQHU9kixeM6kWwuQoq5kSpqftEzGjBfpwG", kind: "token", contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, quoteDecimals: 2, confirmations: 20, explorerTx: "https://tronscan.org/#/transaction/" },
    },
  },
  BTC: {
    name: "Bitcoin (BTC)",
    networks: {
      BITCOIN: { family: "bitcoin", networkLabel: "Bitcoin", networkShort: "Bitcoin", address: "bc1qnhxkhlks4vefy8j287hu5evhxmz5v5395gxkhh", kind: "native", decimals: 8, quoteDecimals: 6, confirmations: 2, explorerTx: "https://mempool.space/tx/" },
    },
  },
  BNB: {
    name: "BNB",
    networks: {
      BSC: { family: "evm", networkLabel: "BNB Smart Chain (BEP-20)", networkShort: "BEP-20", address: EVM_ADDRESS, kind: "native", decimals: 18, quoteDecimals: 5, confirmations: 15, explorerTx: "https://bscscan.com/tx/" },
    },
  },
  ETH: {
    name: "Ethereum (ETH)",
    networks: {
      ETHEREUM: { family: "evm", networkLabel: "Ethereum", networkShort: "Ethereum", address: EVM_ADDRESS, kind: "native", decimals: 18, quoteDecimals: 6, confirmations: 12, explorerTx: "https://etherscan.io/tx/" },
    },
  },
  LTC: {
    name: "Litecoin (LTC)",
    networks: {
      LITECOIN: { family: "litecoin", networkLabel: "Litecoin", networkShort: "Litecoin", address: "LT3hnd2TafAShboJxdJwB1bh4G5TUCcqxP", kind: "native", decimals: 8, quoteDecimals: 4, confirmations: 6, explorerTx: "https://litecoinspace.org/tx/" },
      BSC: {
        family: "evm",
        networkLabel: "LTC on BSC (BEP-20 token)",
        networkShort: "LTC on BSC",
        address: EVM_ADDRESS,
        kind: "token",
        contract: "0x4338665CBB7B2485A8855A139b75D5e34AB0DB94",
        decimals: 18,
        quoteDecimals: 4,
        confirmations: 15,
        note: "This is the Binance-Peg Litecoin token on BNB Smart Chain, not native Litecoin. Do not send native LTC to this address.",
        explorerTx: "https://bscscan.com/tx/",
      },
    },
  },
};

export const COIN_IDS = Object.keys(CRYPTO) as CoinId[];

/** Shown wherever a coin, a network or an address is chosen or displayed. */
export const NETWORK_WARNING = "Only send the selected cryptocurrency using the selected network. Sending through another network may result in permanent loss.";

/** Every coin and network pair, in display order. */
export function allAssets(): CryptoAsset[] {
  return COIN_IDS.flatMap((coin) => (Object.entries(CRYPTO[coin].networks) as [NetworkId, NetworkConfig][]).map(([network, cfg]) => ({ coin, network, ...cfg })));
}

/**
 * The asset for exactly this coin and network, or null. There is deliberately no fallback:
 * an unknown coin, an unknown network or a network the coin is not offered on returns null.
 */
export function getAsset(coin: unknown, network: unknown): CryptoAsset | null {
  if (typeof coin !== "string" || typeof network !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(CRYPTO, coin)) return null;
  const networks = CRYPTO[coin as CoinId].networks;
  if (!Object.prototype.hasOwnProperty.call(networks, network)) return null;
  const cfg = networks[network as NetworkId];
  return cfg ? { coin: coin as CoinId, network: network as NetworkId, ...cfg } : null;
}

/**
 * What a wallet app reads from the QR code: the address, and for Bitcoin and Litecoin the
 * amount too (the only two with a format every wallet understands).
 */
export function paymentUri(asset: Pick<CryptoAsset, "family" | "address">, amount: string): string {
  if (asset.family === "bitcoin") return `bitcoin:${asset.address}?amount=${amount}`;
  if (asset.family === "litecoin") return `litecoin:${asset.address}?amount=${amount}`;
  return asset.address;
}

export const assetKey = (a: { coin: string; network: string }) => `${a.coin}:${a.network}`;

/** What a transaction id looks like on each kind of chain; anything else is refused before any lookup. */
export function isTxHash(family: ChainFamily, value: string): boolean {
  if (family === "evm") return /^0x[0-9a-fA-F]{64}$/.test(value);
  if (family === "solana") return /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(value);
  return /^[0-9a-fA-F]{64}$/.test(value);
}

/** Same transaction, same spelling: hex ids are case-insensitive, Solana signatures are not. */
export function normalizeTxHash(family: ChainFamily, value: string): string {
  const v = value.trim();
  return family === "solana" ? v : v.toLowerCase();
}
