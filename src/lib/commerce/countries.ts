import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export type CountryOption = { code: string; name: string; regionRequired: boolean; postalCodeRequired: boolean; region: string | null };

export const getBuyerCountries = cache(async (): Promise<CountryOption[]> => {
  const rows = await db.country.findMany({
    where: { isEnabled: true, buyersAllowed: true },
    orderBy: { name: "asc" },
    select: { code: true, name: true, regionRequired: true, postalCodeRequired: true, region: true },
  });
  // United States first — it's the home market.
  return rows.sort((a, b) => (a.code === "US" ? -1 : b.code === "US" ? 1 : a.name.localeCompare(b.name)));
});

export const getSellerCountries = cache(async () => {
  return db.country.findMany({ where: { isEnabled: true, sellersAllowed: true }, orderBy: { name: "asc" }, select: { code: true, name: true } });
});

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];
export const CA_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
export const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];
