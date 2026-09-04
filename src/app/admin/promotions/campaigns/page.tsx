import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminPageHeader, Card, EmptyState, Field, Table, Td, Th, Tone, adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCampaignAction, saveCampaignAction } from "@/lib/admin/actions/promotions";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const dateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function AdminCampaignsPage({ searchParams }: PageProps<"/admin/promotions/campaigns">) {
  await requireAdmin("promotions.manage");
  const sp = await searchParams;
  const campaigns = await db.campaign.findMany({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] });
  const edit = typeof sp.edit === "string" ? campaigns.find((c) => c.id === sp.edit) : undefined;
  const now = new Date();
  const live = (c: (typeof campaigns)[number]) => c.isActive && (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt >= now);
  return (
    <>
      <AdminPageHeader crumbs={[{ label: "Promotions", href: "/admin/promotions" }, { label: "Campaigns" }]} title="Campaigns & banners" lead="The newest live global-bar campaign shows above the header on every page; home and store placements render on those pages." actions={<Link href="/admin/promotions/featured" className={adminButton.outline}>Featured listings</Link>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns" body="Create a banner or promo on the right." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Campaign</Th>
                  <Th>Placement</Th>
                  <Th>Window</Th>
                  <Th>State</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <Td className="max-w-[320px]">
                      <span className="font-semibold text-ink-950">{c.name}</span>
                      <span className="line-clamp-1 text-[12px] text-ink-600">{c.title}</span>
                      {c.ctaHref && <span className="block text-[11px] text-ink-500">{c.ctaLabel} → {c.ctaHref}</span>}
                    </Td>
                    <Td>
                      <Tone tone="neutral">{c.placement}</Tone> <span className="text-[12px] text-ink-500">{c.type}</span>
                    </Td>
                    <Td className="text-[12px] text-ink-600">
                      {c.startsAt ? formatDateTime(c.startsAt, { dateOnly: true }) : "now"} → {c.endsAt ? formatDateTime(c.endsAt, { dateOnly: true }) : "∞"}
                    </Td>
                    <Td>{live(c) ? <Tone tone="success">live</Tone> : c.isActive ? <Tone tone="warning">scheduled / ended</Tone> : <Tone tone="neutral">off</Tone>}</Td>
                    <Td>
                      <span className="flex gap-1">
                        <Link href={`/admin/promotions/campaigns?edit=${c.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                          Edit
                        </Link>
                        <ConfirmButton label="Delete" message={`Delete campaign “${c.name}”?`} action={deleteCampaignAction.bind(null, c.id)} size="sm" variant="danger" />
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Card title={edit ? `Edit ${edit.name}` : "New campaign"} className="self-start" actions={edit ? <Link href="/admin/promotions/campaigns" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
          <ActionForm key={edit?.id ?? "new"} action={saveCampaignAction} hidden={edit ? { id: edit.id } : {}} submitLabel={edit ? "Save campaign" : "Create campaign"} resetOnSuccess={!edit}>
            <Field label="Name (internal)">
              <input name="name" required defaultValue={edit?.name ?? ""} className={adminInput} />
            </Field>
            <Field label="Slug" hint="Blank = from name">
              <input name="slug" defaultValue={edit?.slug ?? ""} className={adminInput} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select name="type" defaultValue={edit?.type ?? "banner"} className={adminSelect}>
                  <option value="banner">Banner</option>
                  <option value="hero">Hero</option>
                  <option value="promo">Promo block</option>
                </select>
              </Field>
              <Field label="Placement">
                <select name="placement" defaultValue={edit?.placement ?? "global_bar"} className={adminSelect}>
                  <option value="global_bar">Global top bar</option>
                  <option value="home">Homepage</option>
                  <option value="store">Store page</option>
                </select>
              </Field>
            </div>
            <Field label="Headline (shown to shoppers)">
              <input name="title" required defaultValue={edit?.title ?? ""} className={adminInput} />
            </Field>
            <Field label="Body (optional)">
              <textarea name="body" rows={3} defaultValue={edit?.body ?? ""} className={adminTextarea} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CTA label">
                <input name="ctaLabel" defaultValue={edit?.ctaLabel ?? ""} className={adminInput} />
              </Field>
              <Field label="CTA link">
                <input name="ctaHref" defaultValue={edit?.ctaHref ?? ""} className={adminInput} placeholder="/store?sale=1" />
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
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
