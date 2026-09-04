import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader, Card, Field, Kv, StatusBadge, Table, Td, Th, adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { audienceCount, broadcastAction } from "@/lib/admin/actions/comms";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Broadcast" };
export const dynamic = "force-dynamic";

export default async function AdminBroadcastPage() {
  await requireAdmin("notifications.manage");
  const [all, buyers, sellers, admins, marketing, recent] = await Promise.all([audienceCount("all"), audienceCount("buyers"), audienceCount("sellers"), audienceCount("admins"), audienceCount("marketing"), db.job.findMany({ where: { type: "broadcast_email" }, orderBy: { createdAt: "desc" }, take: 10 })]);
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Notifications", href: "/admin/notifications" }, { label: "Broadcast" }]} title="Email broadcast" lead="Sends the “broadcast” template to an audience through the job queue (200 per batch). Marketing content should go to the opted-in audience only." actions={<Link href="/admin/notifications/announcements" className={adminButton.outline}>In-app announcements</Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Compose" className="lg:col-span-2">
          <ActionForm action={broadcastAction} submitLabel="Queue broadcast" variant="danger" resetOnSuccess>
            <Field label="Audience">
              <select name="audience" defaultValue="marketing" className={adminSelect}>
                <option value="marketing">Marketing opt-in ({marketing})</option>
                <option value="sellers">Sellers ({sellers})</option>
                <option value="buyers">Buyers ({buyers})</option>
                <option value="admins">Admins ({admins})</option>
                <option value="all">Everyone ({all})</option>
              </select>
            </Field>
            <Field label="Subject">
              <input name="subject" required minLength={3} className={adminInput} />
            </Field>
            <Field label="Message (plain text)">
              <textarea name="message" rows={10} required minLength={10} className={adminTextarea} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type the recipient count to confirm">
                <input name="confirmCount" type="number" min={0} required className={adminInput} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-800">
                <input type="checkbox" name="acknowledge" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> I understand this emails real customers
              </label>
            </div>
          </ActionForm>
        </Card>
        <div className="grid gap-6 self-start">
          <Card title="Audience sizes" description="Active accounts only.">
            <Kv items={[{ label: "Marketing opt-in", value: marketing }, { label: "Sellers", value: sellers }, { label: "Buyers", value: buyers }, { label: "Admins", value: admins }, { label: "Everyone", value: all }]} />
          </Card>
          <Card title="Recent broadcasts">
            <Table>
              <thead>
                <tr>
                  <Th>Queued</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recent.map((j) => {
                  const payload = JSON.parse(j.payloadJson) as { subject?: string; audience?: string; cursor?: string };
                  return (
                    <tr key={j.id}>
                      <Td className="whitespace-nowrap text-ink-600">{formatDateTime(j.createdAt)}</Td>
                      <Td className="max-w-[200px] truncate">
                        {payload.subject} <span className="text-[11px] text-ink-500">({payload.audience}{payload.cursor ? ", continued" : ""})</span>
                      </Td>
                      <Td>
                        <StatusBadge status={j.status} />
                      </Td>
                    </tr>
                  );
                })}
                {recent.length === 0 && (
                  <tr>
                    <Td className="text-ink-500">None yet.</Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
