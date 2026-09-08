import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { applyBps } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { zCountry, zOptionalTrimmed, zTrimmed } from "@/lib/validation";

export const AddressSchema = z.object({
  firstName: zTrimmed(80).min(1, { error: "Required" }),
  lastName: zTrimmed(80).min(1, { error: "Required" }),
  company: zOptionalTrimmed(120),
  line1: zTrimmed(200).min(3, { error: "Enter a street address" }),
  line2: zOptionalTrimmed(200),
  city: zTrimmed(120).min(1, { error: "Required" }),
  region: zOptionalTrimmed(80),
  postalCode: zOptionalTrimmed(20),
  countryCode: zCountry,
  phone: zOptionalTrimmed(40),
});
export type Address = z.infer<typeof AddressSchema>;

export function formatAddress(a: Partial<Address> | null | undefined): string[] {
  if (!a) return [];
  return [
    [a.firstName, a.lastName].filter(Boolean).join(" "),
    a.company ?? "",
    a.line1 ?? "",
    a.line2 ?? "",
    [a.city, a.region, a.postalCode].filter(Boolean).join(", "),
    a.countryCode ?? "",
  ].filter((s) => s && s.trim().length > 0);
}

/** Validates the address against the country's rules (enabled, postal/region requirements). */
export async function validateAddressForCountry(address: Address): Promise<{ ok: true } | { ok: false; message: string; field?: string }> {
  const country = await db.country.findUnique({ where: { code: address.countryCode } });
  if (!country || !country.isEnabled || !country.buyersAllowed) return { ok: false, message: country?.restrictionNote ?? "We don't ship to that country yet.", field: "countryCode" };
  if (country.postalCodeRequired && !address.postalCode) return { ok: false, message: "Postal code is required", field: "postalCode" };
  if (country.regionRequired && !address.region) return { ok: false, message: "State / region is required", field: "region" };
  return { ok: true };
}

export type ShippingOption = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  carrierName: string | null;
  requiresSignature: boolean;
  isInsured: boolean;
};

/**
 * The cheapest option that actually delivers: in-person pickup has no carrier and must never
 * be quoted as "free shipping" on product pages or in shopping feeds.
 */
export function cheapestDeliveryOption(options: ShippingOption[]): ShippingOption | null {
  const delivery = options.filter((o) => o.carrierName !== null && o.price >= 0);
  const pool = delivery.length > 0 ? delivery : options.filter((o) => o.price >= 0);
  return [...pool].sort((a, b) => a.price - b.price)[0] ?? null;
}

/** Shipping methods available for a destination country and order subtotal (base minor units). */
export async function shippingOptionsFor(countryCode: string, subtotal: number): Promise<ShippingOption[]> {
  const country = await db.country.findUnique({ where: { code: countryCode }, select: { shippingZoneId: true } });
  if (!country?.shippingZoneId) return [];
  const methods = await db.shippingMethod.findMany({
    where: { zoneId: country.shippingZoneId, isActive: true, zone: { isActive: true } },
    include: { carrier: { select: { name: true } } },
    orderBy: { position: "asc" },
  });
  const settings = await getSettings();
  const globalFree = settings["commerce.freeShippingThreshold"];
  const eligible = methods.filter((m) => (m.minSubtotal === null || subtotal >= m.minSubtotal) && (m.maxSubtotal === null || subtotal <= m.maxSubtotal));
  // A method is free above its own threshold (freeOverSubtotal). The marketplace-wide
  // threshold (Settings › Commerce) is a promotion on top: once the basket reaches it, the
  // cheapest paid method becomes free even if that method's own threshold is higher.
  const cheapestPaid = eligible.filter((m) => m.price > 0).sort((a, b) => a.price - b.price)[0] ?? null;
  return eligible
    .map((m) => {
      const free = (m.freeOverSubtotal !== null && subtotal >= m.freeOverSubtotal) || (globalFree > 0 && subtotal >= globalFree && cheapestPaid?.id === m.id);
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        price: free ? 0 : m.price,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
        carrierName: m.carrier?.name ?? null,
        requiresSignature: m.requiresSignature,
        isInsured: m.isInsured,
      };
    });
}

export type TaxResult = { amount: number; label: string; rateBps: number; inclusive: boolean };

/** Tax for a destination: the highest-priority active rule for country+region, else country-wide. */
export async function taxFor(destination: { countryCode: string; region?: string | null }, taxableAmount: number, shippingAmount: number): Promise<TaxResult> {
  const rules = await db.taxRule.findMany({
    where: { countryCode: destination.countryCode, isActive: true, OR: [{ region: null }, { region: destination.region ?? "" }] },
    orderBy: [{ priority: "desc" }],
  });
  const rule = rules.find((r) => r.region && r.region === destination.region) ?? rules.find((r) => r.region === null);
  if (!rule) return { amount: 0, label: "Tax", rateBps: 0, inclusive: false };
  const base = taxableAmount + (rule.appliesToShipping ? shippingAmount : 0);
  const amount = rule.isInclusive ? Math.round(base - base / (1 + rule.rateBps / 10_000)) : applyBps(base, rule.rateBps);
  return { amount, label: rule.label, rateBps: rule.rateBps, inclusive: rule.isInclusive };
}

/**
 * Can this product ship to the destination country? The seller's ship-to list
 * applies first, then the listing's own allow/deny lists; zone availability is
 * checked separately by shippingOptionsFor.
 */
export function productShipsTo(product: { restrictedCountries: string[]; allowedCountries: string[] }, countryCode: string, seller?: { shipsTo: string[] } | null): boolean {
  if (seller && seller.shipsTo.length > 0 && !seller.shipsTo.includes(countryCode)) return false;
  if (product.restrictedCountries.includes(countryCode)) return false;
  if (product.allowedCountries.length > 0 && !product.allowedCountries.includes(countryCode)) return false;
  return true;
}
