import type { Metadata } from "next";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, Field, FilterBar, StatusBadge, Table, Td, Th, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { reprocessWebhookAction } from "@/lib/admin/actions/system";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

/** Redacts obvious secrets/PII from a stored webhook payload before display. */
function redact(payload: string): string {
  return payload.replace(/"(client_secret|secret|api_key|access_token|number|cvc|cvv|iban|account_number)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"');
}

export default async function AdminWebhooksPage({ searchParams }: PageProps<"/admin/system/webhooks">) {
  await requireAdmin("system.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt"] });
  const status = p.get("status") || "";
  const provider = p.get("provider") || "";
  const where: Prisma.WebhookEventWhereInput = { ...(status ? { status } : {}), ...(provider ? { provider } : {}), ...(p.q ? { OR: [{ type: { contains: p.q } }, { eventId: { contains: p.q } }] } : {}) };
  const [rows, total] = await Promise.all([db.webhookEvent.findMany({ where, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.per }), db.webhookEvent.count({ where })]);
  const base = "/admin/system/webhooks";
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "System", href: "/admin/system" }, { label: "Webhooks" }]} title="Payment webhooks" lead="Every signed provider event is stored once (idempotent) and processed. Failed events can be reprocessed after the underlying issue is fixed." />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[200px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Event type or id" className={adminInput} />
        </Field>
        <Field label="Provider">
          <select name="provider" defaultValue={provider} className={adminSelect}>
            <option value="">Any</option>
            <option value="stripe">stripe</option>
            <option value="paypal">paypal</option>
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            {["received", "processed", "ignored", "failed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No webhook events" body="Configure the provider to POST to /api/webhooks/stripe or /api/webhooks/paypal." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Received</Th>
              <Th>Provider</Th>
              <Th>Event</Th>
              <Th>Status</Th>
              <Th>Payload</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-ink-600">
                  {formatDateTime(e.createdAt)}
                  {e.processedAt && <span className="block text-[11px] text-ink-500">processed {formatDateTime(e.processedAt)}</span>}
                </Td>
                <Td>{e.provider}</Td>
                <Td>
                  <span className="font-mono text-[12px]">{e.type}</span>
                  <span className="block font-mono text-[11px] text-ink-500">{e.eventId}</span>
                </Td>
                <Td>
                  <StatusBadge status={e.status} />
                  {e.error && <span className="block max-w-[220px] truncate text-[11px] text-rose-700">{e.error}</span>}
                </Td>
                <Td className="max-w-[300px]">
                  <details>
                    <summary className="cursor-pointer text-[12px] text-ink-600">view</summary>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 text-[11px] text-ink-700">{redact(e.payload)}</pre>
                  </details>
                </Td>
                <Td>{(e.status === "failed" || e.status === "received") && <ConfirmButton label="Reprocess" message="Run this event through the provider handler again." action={reprocessWebhookAction.bind(null, e.id)} size="sm" />}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
