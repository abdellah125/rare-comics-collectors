/**
 * Server-safe money helpers re-exported for pages that need a fixed (base
 * currency) format alongside schema.org price strings.
 */
export { formatMoney } from "@/lib/money";

/** Schema.org price string: plain decimal, no symbol. */
export function schemaPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}
