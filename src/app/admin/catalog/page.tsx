import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteBrandAction, deleteCategoryAction, saveBrandAction, saveCategoryAction } from "@/lib/admin/actions/catalog";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Categories & brands" };
export const dynamic = "force-dynamic";

export default async function AdminCatalogPage({ searchParams }: PageProps<"/admin/catalog">) {
  await requireAdmin("catalog.manage");
  const sp = await searchParams;
  const [categories, brands] = await Promise.all([
    db.category.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { parent: { select: { name: true } }, _count: { select: { products: true } } } }),
    db.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
  ]);
  const editCat = typeof sp.category === "string" ? categories.find((c) => c.id === sp.category) : undefined;
  const editBrand = typeof sp.brand === "string" ? brands.find((b) => b.id === sp.brand) : undefined;
  return (
    <>
      <AdminPageHeader title="Categories & brands" lead="Categories organise the store; brands are publisher records attached to listings." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid gap-4">
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Parent</Th>
                <Th align="right">Position</Th>
                <Th align="right">Listings</Th>
                <Th>Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/admin/catalog?category=${c.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                      {c.name}
                    </Link>
                    <span className="block font-mono text-[11px] text-ink-500">{c.slug}</span>
                  </Td>
                  <Td className="text-ink-600">{c.parent?.name ?? "—"}</Td>
                  <Td align="right">{c.position}</Td>
                  <Td align="right">{c._count.products}</Td>
                  <Td>{c.isActive ? <Tone tone="success">Active</Tone> : <Tone tone="neutral">Hidden</Tone>}</Td>
                  <Td>
                    <ConfirmButton label="Delete" message={`Delete “${c.name}”? Listings keep their data but lose the category.`} action={deleteCategoryAction.bind(null, c.id)} size="sm" variant="danger" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Card title={editCat ? `Edit “${editCat.name}”` : "New category"} actions={editCat ? <Link href="/admin/catalog" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
            <ActionForm key={editCat?.id ?? "new-cat"} action={saveCategoryAction} hidden={editCat ? { id: editCat.id } : {}} submitLabel={editCat ? "Save category" : "Create category"} resetOnSuccess={!editCat}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input name="name" required defaultValue={editCat?.name ?? ""} className={adminInput} />
                </Field>
                <Field label="Slug" hint="Blank = generated from the name">
                  <input name="slug" defaultValue={editCat?.slug ?? ""} className={adminInput} />
                </Field>
                <Field label="Parent">
                  <select name="parentId" defaultValue={editCat?.parentId ?? ""} className={adminSelect}>
                    <option value="">— top level —</option>
                    {categories.filter((c) => c.id !== editCat?.id).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Position">
                  <input name="position" type="number" min={0} defaultValue={editCat?.position ?? categories.length} className={adminInput} />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <input name="description" defaultValue={editCat?.description ?? ""} className={adminInput} />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="isActive" defaultChecked={editCat?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
                </label>
              </div>
            </ActionForm>
          </Card>
        </div>
        <div className="grid gap-4">
          <Table>
            <thead>
              <tr>
                <Th>Brand</Th>
                <Th align="right">Listings</Th>
                <Th>Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id}>
                  <Td>
                    <Link href={`/admin/catalog?brand=${b.id}`} className="font-semibold text-ink-950 hover:text-brand-700">
                      {b.name}
                    </Link>
                    <span className="block font-mono text-[11px] text-ink-500">{b.slug}</span>
                  </Td>
                  <Td align="right">{b._count.products}</Td>
                  <Td>{b.isActive ? <Tone tone="success">Active</Tone> : <Tone tone="neutral">Hidden</Tone>}</Td>
                  <Td>
                    <ConfirmButton label="Delete" message={`Delete brand “${b.name}”?`} action={deleteBrandAction.bind(null, b.id)} size="sm" variant="danger" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Card title={editBrand ? `Edit “${editBrand.name}”` : "New brand"} actions={editBrand ? <Link href="/admin/catalog" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
            <ActionForm key={editBrand?.id ?? "new-brand"} action={saveBrandAction} hidden={editBrand ? { id: editBrand.id } : {}} submitLabel={editBrand ? "Save brand" : "Create brand"} resetOnSuccess={!editBrand}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input name="name" required defaultValue={editBrand?.name ?? ""} className={adminInput} />
                </Field>
                <Field label="Slug">
                  <input name="slug" defaultValue={editBrand?.slug ?? ""} className={adminInput} />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-ink-800">
                  <input type="checkbox" name="isActive" defaultChecked={editBrand?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
                </label>
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
