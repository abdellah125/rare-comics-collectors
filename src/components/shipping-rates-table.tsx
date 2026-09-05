import { db } from "@/lib/db";
import { formatPriceExact } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";

/** Live domestic shipping rates: the same methods and thresholds checkout uses. */
export async function ShippingRatesTable({ countryCode }: { countryCode?: string }) {
  const settings = await getSettings();
  const code = countryCode ?? settings["marketplace.defaultCountry"];
  const country = await db.country.findUnique({ where: { code }, select: { name: true, shippingZoneId: true } });
  const methods = country?.shippingZoneId
    ? await db.shippingMethod.findMany({ where: { zoneId: country.shippingZoneId, isActive: true, zone: { isActive: true } }, orderBy: { position: "asc" }, select: { id: true, name: true, price: true, freeOverSubtotal: true, estimatedDaysMin: true, estimatedDaysMax: true } })
    : [];
  const globalFree = settings["commerce.freeShippingThreshold"];
  const cheapestPaid = methods.filter((m) => m.price > 0).sort((a, b) => a.price - b.price)[0] ?? null;
  if (methods.length === 0) return <p>Domestic shipping rates are quoted at checkout.</p>;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={`${country?.name ?? code} shipping rates`}>
      <table>
        <thead>
          <tr>
            <th>Service</th>
            <th>Transit</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {methods.map((m) => {
            const candidates = [m.freeOverSubtotal, globalFree > 0 && cheapestPaid?.id === m.id ? globalFree : null].filter((v): v is number => v !== null && v > 0);
            const freeOver = candidates.length ? Math.min(...candidates) : null;
            return (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  {m.estimatedDaysMin === m.estimatedDaysMax ? m.estimatedDaysMin : `${m.estimatedDaysMin} – ${m.estimatedDaysMax}`} business day{m.estimatedDaysMax === 1 ? "" : "s"}
                </td>
                <td>
                  {m.price === 0 ? "Free" : `${formatPriceExact(m.price)} flat`}
                  {freeOver !== null && m.price > 0 ? `, free on orders over ${formatMoney(freeOver, "USD", "en-US", { compact: true })}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
