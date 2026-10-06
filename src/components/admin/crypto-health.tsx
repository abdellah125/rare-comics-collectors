import { Tone } from "@/components/admin/ui";
import { cryptoHealth } from "@/lib/crypto-payments/service";

/**
 * Every accepted coin and network with its receiving address, and whether this server can read
 * that blockchain right now. Rendered on the server; the check uses public data only.
 */
export async function CryptoHealth() {
  const rows = await cryptoHealth();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="text-[11px] uppercase tracking-wide text-ink-500">
          <tr>
            <th className="py-1.5 pr-3 font-semibold">Coin · network</th>
            <th className="py-1.5 pr-3 font-semibold">Receiving address</th>
            <th className="py-1.5 pr-3 font-semibold">Confirmations</th>
            <th className="py-1.5 pr-3 font-semibold">Detection</th>
            <th className="py-1.5 font-semibold">Blockchain API</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr key={r.key} className="align-top">
              <td className="py-2 pr-3 font-medium text-ink-950">
                {r.coin} · {r.networkLabel}
              </td>
              <td className="break-all py-2 pr-3 font-mono text-[12px] text-ink-800">{r.address}</td>
              <td className="py-2 pr-3 text-ink-700">{r.confirmations}</td>
              <td className="py-2 pr-3 text-ink-700">{r.automatic ? "Automatic, by amount" : "Buyer enters the transaction hash"}</td>
              <td className="py-2">
                <Tone tone={r.ok ? "success" : "danger"}>{r.ok ? "Reachable" : "Not reachable"}</Tone>
                <span className="mt-1 block text-[12px] text-ink-600">{r.detail}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
