import type { Metadata } from "next";
import { AddressBook } from "@/components/account/address-book";
import { PageHeader } from "@/components/account/ui";
import { requireUser } from "@/lib/auth/session";
import { AU_STATES, CA_PROVINCES, US_STATES, getBuyerCountries } from "@/lib/commerce/countries";
import { db } from "@/lib/db";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Addresses", description: "Your saved shipping and billing addresses.", path: "/account/addresses", noIndex: true });

export default async function AddressesPage() {
  const user = await requireUser({ next: "/account/addresses" });
  const [addresses, countries] = await Promise.all([db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefaultShipping: "desc" }, { createdAt: "desc" }] }), getBuyerCountries()]);
  return (
    <div className="grid gap-8">
      <PageHeader title="Addresses" lead="Saved addresses speed up checkout. Your default shipping address is preselected on new orders." />
      <AddressBook
        addresses={addresses.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() }))}
        countries={countries}
        regionOptions={{ US: US_STATES, CA: CA_PROVINCES, AU: AU_STATES }}
      />
    </div>
  );
}
