import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Table, Td, Th, Tone, adminInput } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCarrierAction, saveCarrierAction } from "@/lib/admin/actions/shipping";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Carriers" };
export const dynamic = "force-dynamic";

export default async function AdminCarriersPage({ searchParams }: PageProps<"/admin/shipping/carriers">) {
  await requireAdmin("shipping.manage");
  const sp = await searchParams;
  const carriers = await db.carrier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { shipments: true, methods: true } } } });
  const edit = typeof sp.edit === "string" ? carriers.find((c) => c.id === sp.edit) : undefined;
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Shipping", href: "/admin/shipping" }, { label: "Carriers" }]} title="Carriers" lead="Tracking numbers become links using the carrier's URL template ({tracking} is replaced)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Carrier</Th>
                <Th>Code</Th>
                <Th>Tracking template</Th>
                <Th align="right">Shipments</Th>
                <Th>Active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.id}>
                  <Td className="font-semibold">{c.name}</Td>
                  <Td className="font-mono">{c.code}</Td>
                  <Td className="max-w-[280px] truncate text-ink-600">{c.trackingUrlTemplate ?? "—"}</Td>
                  <Td align="right">{c._count.shipments}</Td>
                  <Td>{c.isActive ? <Tone tone="success">on</Tone> : <Tone tone="neutral">off</Tone>}</Td>
                  <Td>
                    <span className="flex gap-1">
                      <Link href={`/admin/shipping/carriers?edit=${c.id}`} className="text-[12px] font-medium text-brand-700">
                        Edit
                      </Link>
                      {c._count.shipments === 0 && c._count.methods === 0 && <ConfirmButton label="Delete" message={`Delete carrier ${c.name}?`} action={deleteCarrierAction.bind(null, c.id)} size="sm" variant="danger" />}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Card title={edit ? `Edit ${edit.name}` : "New carrier"} actions={edit ? <Link href="/admin/shipping/carriers" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
          <ActionForm key={edit?.id ?? "new"} action={saveCarrierAction} hidden={edit ? { id: edit.id } : {}} submitLabel={edit ? "Save carrier" : "Add carrier"} resetOnSuccess={!edit}>
            <Field label="Name">
              <input name="name" required defaultValue={edit?.name ?? ""} className={adminInput} />
            </Field>
            <Field label="Code" hint="Short identifier, e.g. ups">
              <input name="code" required defaultValue={edit?.code ?? ""} className={adminInput} />
            </Field>
            <Field label="Tracking URL template" hint="https://…?num={tracking}">
              <input name="trackingUrlTemplate" defaultValue={edit?.trackingUrlTemplate ?? ""} className={adminInput} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="isActive" defaultChecked={edit?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
            </label>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
