import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, Field, Table, Td, Th, Tone, adminButton, adminInput, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { saveTemplateAction, sendTestEmailAction } from "@/lib/admin/actions/comms";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Notifications & email" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  await requireAdmin("notifications.manage");
  const sp = await searchParams;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [templates, stats] = await Promise.all([db.emailTemplate.findMany({ orderBy: { name: "asc" } }), db.emailLog.groupBy({ by: ["status"], _count: { _all: true }, where: { createdAt: { gte: weekAgo } } })]);
  const edit = typeof sp.key === "string" ? templates.find((t) => t.key === sp.key) : undefined;
  const smtp = Boolean(env.smtp.host);
  const count = (s: string) => stats.find((x) => x.status === s)?._count._all ?? 0;
  return (
    <>
      <AdminPageHeader
        title="Notifications & email"
        lead={smtp ? `Delivering via SMTP ${env.smtp.host}. Last 7 days: ${count("sent")} sent, ${count("failed")} failed, ${count("queued")} queued.` : `SMTP is not configured — emails are written to the log only (${count("logged")} logged in the last 7 days). Set SMTP_HOST/SMTP_USER/SMTP_PASS to send for real.`}
        actions={
          <>
            <Link href="/admin/notifications/announcements" className={adminButton.outline}>
              Announcements
            </Link>
            <Link href="/admin/notifications/broadcast" className={adminButton.outline}>
              Broadcast
            </Link>
            <Link href="/admin/notifications/email-log" className={adminButton.outline}>
              Email log
            </Link>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Template</Th>
                <Th>Subject</Th>
                <Th>Variables</Th>
                <Th>Updated</Th>
                <Th>State</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.key}>
                  <Td>
                    <span className="font-semibold text-ink-950">{t.name}</span>
                    <span className="block font-mono text-[11px] text-ink-500">{t.key}</span>
                  </Td>
                  <Td className="max-w-[260px] truncate text-ink-700">{t.subject}</Td>
                  <Td className="max-w-[200px] text-[11px] text-ink-500">{(JSON.parse(t.variablesJson) as string[]).join(", ")}</Td>
                  <Td className="text-ink-600">{formatDateTime(t.updatedAt, { dateOnly: true })}</Td>
                  <Td>{t.isEnabled ? <Tone tone="success">on</Tone> : <Tone tone="neutral">off</Tone>}</Td>
                  <Td>
                    <span className="flex gap-1">
                      <Link href={`/admin/notifications?key=${t.key}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                        Edit
                      </Link>
                      <ConfirmButton label="Test" message="Sends a sample of this template to your own email address." action={sendTestEmailAction.bind(null, t.key)} size="sm" />
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <Card title={edit ? `Edit “${edit.name}”` : "Edit a template"} description={edit ? `Variables: ${["siteName", "siteUrl", "supportEmail", ...(JSON.parse(edit.variablesJson) as string[])].map((v) => `{{${v}}}`).join(" ")}` : "Pick a template from the list."} className="self-start" actions={edit ? <Link href="/admin/notifications" className="text-[13px] text-ink-600">Close</Link> : undefined}>
          {edit && (
            <ActionForm key={edit.key} action={saveTemplateAction} hidden={{ key: edit.key }} submitLabel="Save template">
              <Field label="Subject">
                <input name="subject" required defaultValue={edit.subject} className={adminInput} />
              </Field>
              <Field label="Body (plain text)">
                <textarea name="bodyText" rows={14} required defaultValue={edit.bodyText} className={`${adminTextarea} font-mono text-[12px]`} />
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="isEnabled" defaultChecked={edit.isEnabled} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Enabled (disabled templates are skipped silently)
              </label>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
