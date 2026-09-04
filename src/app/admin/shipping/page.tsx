import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteMethodAction, deleteZoneAction, saveMethodAction, saveZoneAction } from "@/lib/admin/actions/shipping";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Shipping" };
export const dynamic = "force-dynamic";

export default async function AdminShippingPage({ searchParams }: PageProps<"/admin/shipping">) {
  await requireAdmin("shipping.manage");
  const sp = await searchParams;
  const [zones, carriers] = await Promise.all([
    db.shippingZone.findMany({ orderBy: { position: "asc" }, include: { countries: { select: { code: true, name: true } }, methods: { orderBy: { position: "asc" }, include: { carrier: { select: { name: true } } } } } }),
    db.carrier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const editZoneId = typeof sp.zone === "string" ? sp.zone : "";
  const editMethod = typeof sp.method === "string" ? zones.flatMap((z) => z.methods).find((m) => m.id === sp.method) : undefined;
  const money = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
  return (
    <>
      <AdminPageHeader
        title="Shipping zones & methods"
        lead="A destination country belongs to one zone; each zone offers its own methods and rates. Sellers set handling time; rates are marketplace-wide."
        actions={
          <>
            <Link href="/admin/shipping/countries" className={adminButton.outline}>
              Countries
            </Link>
            <Link href="/admin/shipping/carriers" className={adminButton.outline}>
              Carriers
            </Link>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-4 xl:col-span-2">
          {zones.map((z) => (
            <Card key={z.id} title={z.name} description={`${z.countries.length} countr${z.countries.length === 1 ? "y" : "ies"}: ${z.countries.map((c) => c.code).join(", ") || "none assigned"}`} actions={<span className="flex items-center gap-2">{!z.isActive && <Tone tone="neutral">Inactive</Tone>}<Link href={`/admin/shipping?zone=${z.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>Edit zone</Link><ConfirmButton label="Delete" message="Delete this zone (only possible when it has no countries)." action={deleteZoneAction.bind(null, z.id)} size="sm" variant="danger" /></span>}>
              <table className="w-full text-[13px]">
                <thead className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                  <tr>
                    <th className="py-1">Method</th>
                    <th className="py-1">Carrier</th>
                    <th className="py-1 text-right">Price</th>
                    <th className="py-1 text-right">Free over</th>
                    <th className="py-1">Days</th>
                    <th className="py-1">Flags</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {z.methods.map((m) => (
                    <tr key={m.id}>
                      <td className="py-1.5">
                        <span className="font-medium text-ink-950">{m.name}</span>
                        {m.description && <span className="block text-[12px] text-ink-500">{m.description}</span>}
                      </td>
                      <td className="py-1.5 text-ink-700">{m.carrier?.name ?? "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">{m.price === 0 ? "Free" : formatMoney(m.price)}</td>
                      <td className="py-1.5 text-right tabular-nums">{m.freeOverSubtotal !== null ? formatMoney(m.freeOverSubtotal) : "—"}</td>
                      <td className="py-1.5">
                        {m.estimatedDaysMin}–{m.estimatedDaysMax}
                      </td>
                      <td className="py-1.5">
                        <span className="flex gap-1">
                          {m.isInsured && <Tone tone="brand">insured</Tone>}
                          {m.requiresSignature && <Tone tone="neutral">signature</Tone>}
                          {!m.isActive && <Tone tone="danger">off</Tone>}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">
                        <span className="flex justify-end gap-1">
                          <Link href={`/admin/shipping?method=${m.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                            Edit
                          </Link>
                          <ConfirmButton label="Delete" message={`Delete method “${m.name}”?`} action={deleteMethodAction.bind(null, m.id)} size="sm" variant="danger" />
                        </span>
                      </td>
                    </tr>
                  ))}
                  {z.methods.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-2 text-ink-500">
                        No methods — buyers in this zone can&apos;t check out physical items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 self-start">
          <Card title={editZoneId ? "Edit zone" : "New zone"} actions={editZoneId ? <Link href="/admin/shipping" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
            {(() => {
              const z = zones.find((x) => x.id === editZoneId);
              return (
                <ActionForm key={editZoneId || "new-zone"} action={saveZoneAction} hidden={z ? { id: z.id } : {}} submitLabel={z ? "Save zone" : "Create zone"} resetOnSuccess={!z}>
                  <Field label="Name">
                    <input name="name" required defaultValue={z?.name ?? ""} className={adminInput} />
                  </Field>
                  <Field label="Position">
                    <input name="position" type="number" min={0} defaultValue={z?.position ?? zones.length} className={adminInput} />
                  </Field>
                  <label className="flex items-center gap-2 text-[13px] text-ink-800">
                    <input type="checkbox" name="isActive" defaultChecked={z?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
                  </label>
                </ActionForm>
              );
            })()}
          </Card>
          <Card title={editMethod ? `Edit ${editMethod.name}` : "New shipping method"} actions={editMethod ? <Link href="/admin/shipping" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
            <ActionForm key={editMethod?.id ?? "new-method"} action={saveMethodAction} hidden={editMethod ? { id: editMethod.id } : {}} submitLabel={editMethod ? "Save method" : "Add method"} resetOnSuccess={!editMethod}>
              <Field label="Zone">
                <select name="zoneId" defaultValue={editMethod?.zoneId ?? zones[0]?.id ?? ""} className={adminSelect} required>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Name">
                <input name="name" required defaultValue={editMethod?.name ?? ""} className={adminInput} />
              </Field>
              <Field label="Description">
                <input name="description" defaultValue={editMethod?.description ?? ""} className={adminInput} />
              </Field>
              <Field label="Carrier">
                <select name="carrierId" defaultValue={editMethod?.carrierId ?? ""} className={adminSelect}>
                  <option value="">—</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (USD)">
                  <input name="price" type="number" step="0.01" min={0} required defaultValue={money(editMethod?.price ?? 0)} className={adminInput} />
                </Field>
                <Field label="Free over subtotal (USD)">
                  <input name="freeOverSubtotal" type="number" step="0.01" min={0} defaultValue={money(editMethod?.freeOverSubtotal ?? null)} className={adminInput} />
                </Field>
                <Field label="Min subtotal">
                  <input name="minSubtotal" type="number" step="0.01" min={0} defaultValue={money(editMethod?.minSubtotal ?? null)} className={adminInput} />
                </Field>
                <Field label="Max subtotal">
                  <input name="maxSubtotal" type="number" step="0.01" min={0} defaultValue={money(editMethod?.maxSubtotal ?? null)} className={adminInput} />
                </Field>
                <Field label="Days (min)">
                  <input name="estimatedDaysMin" type="number" min={0} defaultValue={editMethod?.estimatedDaysMin ?? 2} className={adminInput} />
                </Field>
                <Field label="Days (max)">
                  <input name="estimatedDaysMax" type="number" min={0} defaultValue={editMethod?.estimatedDaysMax ?? 5} className={adminInput} />
                </Field>
                <Field label="Position">
                  <input name="position" type="number" min={0} defaultValue={editMethod?.position ?? 0} className={adminInput} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="isInsured" defaultChecked={editMethod?.isInsured ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Insured
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="requiresSignature" defaultChecked={editMethod?.requiresSignature ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Signature required
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="isActive" defaultChecked={editMethod?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
              </label>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
