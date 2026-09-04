import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, EmptyState, Field, Table, Td, Th, Tone, adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteAnnouncementAction, saveAnnouncementAction } from "@/lib/admin/actions/comms";
import { db } from "@/lib/db";
import { ANNOUNCEMENT_AUDIENCES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

const dateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function AdminAnnouncementsPage({ searchParams }: PageProps<"/admin/notifications/announcements">) {
  await requireAdmin("notifications.manage");
  const sp = await searchParams;
  const rows = await db.announcement.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], include: { createdBy: { select: { name: true } } } });
  const edit = typeof sp.edit === "string" ? rows.find((a) => a.id === sp.edit) : undefined;
  const now = new Date();
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Notifications", href: "/admin/notifications" }, { label: "Announcements" }]} title="Announcements" lead="Shown as a banner to the chosen audience while active, and optionally pushed as an in-app notification when created." actions={<Link href="/admin/notifications/broadcast" className={adminButton.outline}>Email broadcast</Link>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState title="No announcements" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Announcement</Th>
                  <Th>Audience</Th>
                  <Th>Level</Th>
                  <Th>Window</Th>
                  <Th>State</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const live = a.isActive && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt >= now);
                  return (
                    <tr key={a.id}>
                      <Td className="max-w-[340px]">
                        <span className="font-semibold text-ink-950">{a.title}</span>
                        <span className="line-clamp-2 text-[12px] text-ink-600">{a.body}</span>
                        <span className="block text-[11px] text-ink-500">
                          {a.createdBy.name} · {formatDateTime(a.createdAt, { dateOnly: true })}
                        </span>
                      </Td>
                      <Td>
                        <Tone tone="neutral">{a.audience}</Tone>
                      </Td>
                      <Td>
                        <Tone tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warning" : a.level === "success" ? "success" : "brand"}>{a.level}</Tone>
                      </Td>
                      <Td className="text-[12px] text-ink-600">
                        {a.startsAt ? formatDateTime(a.startsAt, { dateOnly: true }) : "now"} → {a.endsAt ? formatDateTime(a.endsAt, { dateOnly: true }) : "∞"}
                      </Td>
                      <Td>{live ? <Tone tone="success">live</Tone> : a.isActive ? <Tone tone="warning">scheduled / ended</Tone> : <Tone tone="neutral">off</Tone>}</Td>
                      <Td>
                        <span className="flex gap-1">
                          <Link href={`/admin/notifications/announcements?edit=${a.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                            Edit
                          </Link>
                          <ConfirmButton label="Delete" message="Delete this announcement?" action={deleteAnnouncementAction.bind(null, a.id)} size="sm" variant="danger" />
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Card title={edit ? "Edit announcement" : "New announcement"} className="self-start" actions={edit ? <Link href="/admin/notifications/announcements" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
          <ActionForm key={edit?.id ?? "new"} action={saveAnnouncementAction} hidden={edit ? { id: edit.id } : {}} submitLabel={edit ? "Save" : "Publish"} resetOnSuccess={!edit}>
            <Field label="Title">
              <input name="title" required defaultValue={edit?.title ?? ""} className={adminInput} />
            </Field>
            <Field label="Message">
              <textarea name="body" rows={4} required defaultValue={edit?.body ?? ""} className={adminTextarea} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Audience">
                <select name="audience" defaultValue={edit?.audience ?? "all"} className={adminSelect}>
                  {ANNOUNCEMENT_AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Level">
                <select name="level" defaultValue={edit?.level ?? "info"} className={adminSelect}>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
              <Field label="Starts">
                <input name="startsAt" type="date" defaultValue={dateInput(edit?.startsAt)} className={adminInput} />
              </Field>
              <Field label="Ends">
                <input name="endsAt" type="date" defaultValue={dateInput(edit?.endsAt)} className={adminInput} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="isActive" defaultChecked={edit?.isActive ?? true} className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Active
            </label>
            {!edit && (
              <label className="flex items-center gap-2 text-[13px] text-ink-800">
                <input type="checkbox" name="notify" className="h-4 w-4 rounded border-ink-300 accent-brand-600" /> Also push an in-app notification to everyone in the audience
              </label>
            )}
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
