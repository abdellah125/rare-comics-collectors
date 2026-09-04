import type { Metadata } from "next";
import { ListingForm } from "@/components/seller/listing-form";
import { PageHeader } from "@/components/account/ui";
import { requireSeller } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = pageMetadata({ title: "New listing", description: "List a book for sale.", path: "/dashboard/listings/new", noIndex: true });

export default async function NewListingPage() {
  await requireSeller({ next: "/dashboard/listings/new" });
  const [settings, categories] = await Promise.all([getSettings(), db.category.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { id: true, name: true } })]);
  return (
    <div className="grid gap-6">
      <PageHeader title="Add a listing" lead={settings["listings.requireReview"] ? "New listings are checked by a moderator before they go live — usually within a business day." : "Published listings appear in the store immediately."} />
      <ListingForm initial={null} categories={categories} maxImages={settings["listings.maxImages"]} minPriceLabel={formatMoney(settings["listings.minPrice"])} />
    </div>
  );
}
