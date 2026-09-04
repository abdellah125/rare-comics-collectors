import type { Metadata } from "next";
import { AdminProductForm } from "@/components/admin/product-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "New listing" };

export default async function AdminNewProductPage() {
  await requireAdmin("products.manage");
  const [settings, sellers, brands, categories] = await Promise.all([
    getSettings(),
    db.sellerProfile.findMany({ where: { status: "approved" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Listings", href: "/admin/products" }, { label: "New" }]} title="New listing" lead="House inventory by default; pick a seller to list on their behalf." />
      <AdminProductForm initial={null} sellers={sellers} brands={brands} categories={categories} maxImages={settings["listings.maxImages"]} />
    </>
  );
}
