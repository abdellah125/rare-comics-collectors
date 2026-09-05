import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Table, Td, Th, Tone, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteTaxRuleAction, saveTaxRuleAction } from "@/lib/admin/actions/finance";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Taxes" };
export const dynamic = "force-dynamic";

export default async function AdminTaxesPage({ searchParams }: PageProps<"/admin/finance/taxes">) {
  await requireAdmin("finance.manage");
  const sp = await searchParams;
  const [rules, countries] = await Promise.all([db.taxRule.findMany({ orderBy: [{ countryCode: "asc" }, { region: "asc" }, { priority: "desc" }], include: { country: { select: { name: true } } } }), db.country.findMany({ where: { isEnabled: true }, orderBy: { name: "asc" }, select: { code: true, name: true } })]);
  const edit = typeof sp.edit === "string" ? rules.find((r) => r.id === sp.edit) : undefined;
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Taxes" }]} title="Tax / VAT / GST rules" lead={`Each rule decides whether tax is added at checkout or already included in prices. The highest-priority rule for the buyer's country and region applies; a region-specific rule beats a country-wide one.`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Country</Th>
                <Th>Region</Th>
                <Th>Label</Th>
                <Th align="right">Rate</Th>
                <Th>Shipping</Th>
                <Th>Inclusive</Th>
                <Th align="right">Priority</Th>
                <Th>Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td>
                    {r.country.name} <span className="text-ink-500">({r.countryCode})</span>
                  </Td>
                  <Td>{r.region ?? <span className="text-ink-400">all</span>}</Td>
                  <Td>{r.label}</Td>
                  <Td align="right">{(r.rateBps / 100).toFixed(2)}%</Td>
                  <Td>{r.appliesToShipping ? "yes" : "no"}</Td>
                  <Td>{r.isInclusive ? "yes" : "no"}</Td>
                  <Td align="right">{r.priority}</Td>
                  <Td>{r.isActive ? <Tone tone="success">on</Tone> : <Tone tone="neutral">off</Tone>}</Td>
                  <Td>
                    <span className="flex gap-1">
                      <Link href={`/admin/finance/taxes?edit=${r.id}`} className="text-[12px] font-medium text-brand-700">
                        Edit
                      </Link>
                      <ConfirmButton label="Delete" message="Delete this tax rule?" action={deleteTaxRuleAction.bind(null, r.id)} size="sm" variant="danger" />
                    </span>
                  </Td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <Td className="text-ink-500">No tax rules — orders are untaxed.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
        <Card title={edit ? `Edit ${edit.label}` : "New tax rule"} actions={edit ? <Link href="/admin/finance/taxes" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
          <ActionForm key={edit?.id ?? "new"} action={saveTaxRuleAction} hidden={edit ? { id: edit.id } : {}} submitLabel={edit ? "Save rule" : "Add rule"} resetOnSuccess={!edit}>
            <Field label="Country">
              <select name="countryCode" defaultValue={edit?.countryCode ?? "US"} className={adminSelect}>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Region / state (optional)" hint="e.g. TX. Leave blank for the whole country.">
              <input name="region" defaultValue={edit?.region ?? ""} className={adminInput} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label">
                <input name="label" required defaultValue={edit?.label ?? ""} className={adminInput} placeholder="VAT" />
              </Field>
              <Field label="Rate (bps)" hint="825 = 8.25%">
                <input name="rateBps" type="number" min={0} max={10000} required defaultValue={edit?.rateBps ?? ""} className={adminInput} />
              </Field>
              <Field label="Priority">
                <input name="priority" type="number" min={0} max={100} defaultValue={edit?.priority ?? 0} className={adminInput} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="appliesToShipping" defaultChecked={edit?.appliesToShipping ?? false} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Tax applies to shipping
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="isInclusive" defaultChecked={edit?.isInclusive ?? false} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Tax included in prices (VAT-style)
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="isActive" defaultChecked={edit?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
            </label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
