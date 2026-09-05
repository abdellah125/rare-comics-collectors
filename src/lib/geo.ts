import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/** Country names for dashboards and order pages (one query per request). */
export const countryNames = cache(async (): Promise<Map<string, string>> => {
  const rows = await db.country.findMany({ select: { code: true, name: true } });
  return new Map(rows.map((r) => [r.code, r.name]));
});

/** Regional-indicator flag for an ISO 3166-1 alpha-2 code. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Country name for display. Flags are deliberately not prefixed: Windows renders them as bare letter pairs. */
export function countryLabel(names: Map<string, string>, code: string | null | undefined): string {
  if (!code) return "—";
  return names.get(code.toUpperCase()) ?? code.toUpperCase();
}

/** A shipment crosses a border when the seller's ship-from country differs from the destination. */
export function isInternational(from: string | null | undefined, to: string | null | undefined): boolean {
  return Boolean(from && to && from.toUpperCase() !== to.toUpperCase());
}

/** Estimated delivery window: handling days plus the method's transit range, from the paid date. */
export function deliveryWindow(paidAt: Date, handlingDays: number, transitMin: number, transitMax: number): { from: Date; to: Date } {
  const day = 86_400_000;
  return { from: new Date(paidAt.getTime() + (handlingDays + transitMin) * day), to: new Date(paidAt.getTime() + (handlingDays + transitMax) * day) };
}

export const DEFAULT_CUSTOMS_NOTE = "Orders shipped from another country can be subject to import duties, taxes and customs processing charged by the carrier on delivery. Those charges are set by your country and are not included in the order total.";
