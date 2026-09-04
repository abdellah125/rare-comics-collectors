import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, EmptyState, Field, StatusBadge, Table, Td, Th, adminInput } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { featureProductAction, unfeatureProductAction } from "@/lib/admin/actions/promotions";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Featured listings" };
export const dynamic = "force-dynamic";

export default async function AdminFeaturedPage() {
  await requireAdmin("promotions.manage");
  const products = await db.product.findMany({ where: { featured: true, deletedAt: null }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, sku: true, slug: true, price: true, status: true, featuredUntil: true, viewCount: true, soldCount: true, seller: { select: { displayName: true } } } });
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Promotions", href: "/admin/promotions" }, { label: "Featured" }]} title="Featured listings" lead="Featured listings lead the homepage and store sorting. An optional end date un-features them automatically." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {products.length === 0 ? (
            <EmptyState title="Nothing featured" body="Add a listing by SKU, slug or id." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Listing</Th>
                  <Th>Seller</Th>
                  <Th align="right">Price</Th>
                  <Th>Status</Th>
                  <Th>Until</Th>
                  <Th align="right">Views / sold</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <Td className="max-w-[320px]">
                      <Link href={`/admin/products/${p.id}`} className="line-clamp-1 font-medium text-ink-950 hover:text-brand-700">
                        {p.title}
                      </Link>
                      <span className="font-mono text-[11px] text-ink-500">{p.sku}</span>
                    </Td>
                    <Td className="text-ink-700">{p.seller?.displayName ?? "Marketplace"}</Td>
                    <Td align="right">{formatMoney(p.price)}</Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                    <Td className="text-ink-600">{p.featuredUntil ? formatDateTime(p.featuredUntil, { dateOnly: true }) : "—"}</Td>
                    <Td align="right">
                      {p.viewCount} / {p.soldCount}
                    </Td>
                    <Td>
                      <ConfirmButton label="Unfeature" message="Remove from featured?" action={unfeatureProductAction.bind(null, p.id)} size="sm" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Card title="Feature a listing" className="self-start">
          <ActionForm action={featureProductAction} submitLabel="Feature" resetOnSuccess>
            <Field label="SKU, slug or id">
              <input name="product" required className={adminInput} />
            </Field>
            <Field label="Until (optional)">
              <input name="until" type="date" className={adminInput} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
