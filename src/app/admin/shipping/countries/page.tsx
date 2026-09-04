import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { BulkActionsBar, BulkProvider, RowCheckbox, SelectAllCheckbox } from "@/components/admin/bulk";
import { AdminPageHeader, Card, Field, FilterBar, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { bulkCountriesAction, saveCountryAction } from "@/lib/admin/actions/shipping";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Countries" };
export const dynamic = "force-dynamic";

export default async function AdminCountriesPage({ searchParams }: PageProps<"/admin/shipping/countries">) {
  await requireAdmin("shipping.manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const zoneFilter = typeof sp.zone === "string" ? sp.zone : "";
  const [countries, zones, currencies] = await Promise.all([
    db.country.findMany({ where: { ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q.toUpperCase(), mode: "insensitive" as const } }] } : {}), ...(zoneFilter === "none" ? { shippingZoneId: null } : zoneFilter ? { shippingZoneId: zoneFilter } : {}) }, orderBy: { name: "asc" }, include: { shippingZone: { select: { name: true } } } }),
    db.shippingZone.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.currency.findMany({ select: { code: true } }),
  ]);
  const editCode = typeof sp.edit === "string" ? sp.edit.toUpperCase() : "";
  const edit = editCode ? (countries.find((c) => c.code === editCode) ?? (await db.country.findUnique({ where: { code: editCode }, include: { shippingZone: { select: { name: true } } } }))) : undefined;
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Shipping", href: "/admin/shipping" }, { label: "Countries" }]} title="Countries & regional availability" lead="Control where buyers can ship to, where sellers may register, address rules and the default display currency per country." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar action="/admin/shipping/countries" reset>
            <Field label="Search" className="flex-1">
              <input name="q" defaultValue={q} placeholder="Name or code" className={adminInput} />
            </Field>
            <Field label="Zone">
              <select name="zone" defaultValue={zoneFilter} className={adminSelect}>
                <option value="">Any</option>
                <option value="none">Unassigned</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
          </FilterBar>
          <BulkProvider>
            <BulkActionsBar
              run={bulkCountriesAction}
              actions={[
                { id: "enable", label: "Enable for buyers" },
                { id: "disable", label: "Disable", danger: true, confirm: "Disable {n} countries for buyers and sellers?" },
                { id: "allow_sellers", label: "Allow sellers" },
                { id: "block_sellers", label: "Block sellers" },
                ...zones.map((z) => ({ id: `zone:${z.id}`, label: `→ ${z.name}` })),
              ]}
            />
            <Table>
              <thead>
                <tr>
                  <Th className="w-8">
                    <SelectAllCheckbox ids={countries.map((c) => c.code)} />
                  </Th>
                  <Th>Country</Th>
                  <Th>Zone</Th>
                  <Th>Currency</Th>
                  <Th>Buyers</Th>
                  <Th>Sellers</Th>
                  <Th>Address rules</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.code} className={c.isEnabled ? "" : "opacity-60"}>
                    <Td>
                      <RowCheckbox id={c.code} label={c.name} />
                    </Td>
                    <Td>
                      <span className="font-semibold text-ink-950">{c.name}</span> <span className="font-mono text-[12px] text-ink-500">{c.code}</span>
                      {c.restrictionNote && <span className="block text-[11px] text-rose-700">{c.restrictionNote}</span>}
                    </Td>
                    <Td className="text-ink-700">{c.shippingZone?.name ?? <span className="text-rose-700">none</span>}</Td>
                    <Td className="font-mono">{c.currencyCode ?? "—"}</Td>
                    <Td>{c.isEnabled && c.buyersAllowed ? <Tone tone="success">yes</Tone> : <Tone tone="neutral">no</Tone>}</Td>
                    <Td>{c.isEnabled && c.sellersAllowed ? <Tone tone="success">yes</Tone> : <Tone tone="neutral">no</Tone>}</Td>
                    <Td className="text-[12px] text-ink-600">
                      {c.postalCodeRequired ? "postal" : "no postal"} · {c.regionRequired ? "region" : "no region"}
                    </Td>
                    <Td>
                      <Link href={`/admin/shipping/countries?edit=${c.code}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="text-[12px] font-medium text-brand-700">
                        Edit
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </BulkProvider>
        </div>
        <Card title={edit ? `Edit ${edit.name}` : "Add country"} actions={edit ? <Link href="/admin/shipping/countries" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
          <ActionForm key={edit?.code ?? "new"} action={saveCountryAction} submitLabel={edit ? "Save country" : "Add country"} resetOnSuccess={!edit}>
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <Field label="Code">
                <input name="code" required maxLength={2} defaultValue={edit?.code ?? ""} readOnly={Boolean(edit)} className={adminInput} />
              </Field>
              <Field label="Name">
                <input name="name" required defaultValue={edit?.name ?? ""} className={adminInput} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Region label">
                <input name="region" defaultValue={edit?.region ?? ""} className={adminInput} placeholder="Europe" />
              </Field>
              <Field label="Display currency">
                <select name="currencyCode" defaultValue={edit?.currencyCode ?? ""} className={adminSelect}>
                  <option value="">—</option>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Shipping zone">
              <select name="shippingZoneId" defaultValue={edit?.shippingZoneId ?? ""} className={adminSelect}>
                <option value="">— none (cannot ship) —</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </Field>
            {[
              ["isEnabled", "Enabled", edit?.isEnabled ?? true],
              ["buyersAllowed", "Buyers can ship here", edit?.buyersAllowed ?? true],
              ["sellersAllowed", "Sellers can register from here", edit?.sellersAllowed ?? true],
              ["postalCodeRequired", "Postal code required", edit?.postalCodeRequired ?? true],
              ["regionRequired", "State / region required", edit?.regionRequired ?? false],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> {label}
              </label>
            ))}
            <Field label="Restriction note (shown to buyers)">
              <input name="restrictionNote" defaultValue={edit?.restrictionNote ?? ""} className={adminInput} />
            </Field>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
