import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Pagination } from "@/components/admin/pagination";
import { AdminPageHeader, Card, EmptyState, Field, FilterBar, Table, Td, Th, Tone, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCouponAction, saveCouponAction, toggleCouponAction } from "@/lib/admin/actions/promotions";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { COUPON_SCOPES, COUPON_TYPES } from "@/lib/domain";
import { formatDateTime } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Promotions" };
export const dynamic = "force-dynamic";

const dateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function AdminPromotionsPage({ searchParams }: PageProps<"/admin/promotions">) {
  await requireAdmin("promotions.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "createdAt", sorts: ["createdAt", "code", "usesCount"] });
  const state = p.get("state") || "";
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const where: Prisma.CouponWhereInput = {
    ...(state === "active" ? { isActive: true, OR: [{ endsAt: null }, { endsAt: { gte: now } }] } : state === "expired" ? { endsAt: { lt: now } } : state === "disabled" ? { isActive: false } : {}),
    ...(p.q ? { OR: [{ code: { contains: p.q.toUpperCase(), mode: "insensitive" as const } }, { name: { contains: p.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, redeemed] = await Promise.all([
    db.coupon.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, include: { seller: { select: { displayName: true } }, _count: { select: { redemptions: true } } } }),
    db.coupon.count({ where }),
    db.couponRedemption.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { createdAt: { gte: monthAgo } } }),
  ]);
  const edit = typeof sp.edit === "string" ? await db.coupon.findUnique({ where: { id: sp.edit } }) : null;
  const scopeIds: string[] = edit ? (JSON.parse(edit.scopeIdsJson) as string[]) : [];
  const base = "/admin/promotions";
  return (
    <>
      <AdminPageHeader
        title="Coupons"
        lead={`${redeemed._count._all} redemptions worth ${formatMoney(redeemed._sum.amount ?? 0)} in the last 30 days. Coupons apply at checkout; scope limits them to products, categories or sellers.`}
        actions={
          <>
            <Link href="/admin/promotions/campaigns" className={adminButton.outline}>
              Campaigns & banners
            </Link>
            <Link href="/admin/promotions/featured" className={adminButton.outline}>
              Featured listings
            </Link>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FilterBar action={base} reset>
            <Field label="Search" className="flex-1">
              <input name="q" defaultValue={p.q} placeholder="Code or name" className={adminInput} />
            </Field>
            <Field label="State">
              <select name="state" defaultValue={state} className={adminSelect}>
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="disabled">Disabled</option>
              </select>
            </Field>
          </FilterBar>
          {rows.length === 0 ? (
            <EmptyState title="No coupons yet" body="Create one on the right." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Discount</Th>
                  <Th>Scope</Th>
                  <Th>Window</Th>
                  <Th align="right">Uses</Th>
                  <Th>State</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const expired = c.endsAt ? c.endsAt < now : false;
                  return (
                    <tr key={c.id}>
                      <Td>
                        <span className="font-mono font-semibold text-ink-950">{c.code}</span>
                        {c.name && <span className="block text-[12px] text-ink-500">{c.name}</span>}
                      </Td>
                      <Td>
                        {c.type === "percent" ? `${c.value / 100}%` : c.type === "fixed" ? formatMoney(c.value) : "Free shipping"}
                        {c.maxDiscount !== null && <span className="block text-[11px] text-ink-500">max {formatMoney(c.maxDiscount)}</span>}
                        {c.minSubtotal !== null && <span className="block text-[11px] text-ink-500">min order {formatMoney(c.minSubtotal)}</span>}
                      </Td>
                      <Td className="text-ink-700">
                        {c.scope}
                        {c.seller && <span className="block text-[11px] text-ink-500">{c.seller.displayName}</span>}
                        {c.eligibility === "new_customers" && <Tone tone="brand">new customers</Tone>}
                      </Td>
                      <Td className="text-[12px] text-ink-600">
                        {c.startsAt ? formatDateTime(c.startsAt, { dateOnly: true }) : "now"} → {c.endsAt ? formatDateTime(c.endsAt, { dateOnly: true }) : "∞"}
                      </Td>
                      <Td align="right">
                        {c.usesCount}
                        {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                      </Td>
                      <Td>{!c.isActive ? <Tone tone="neutral">disabled</Tone> : expired ? <Tone tone="danger">expired</Tone> : c.maxUses !== null && c.usesCount >= c.maxUses ? <Tone tone="warning">exhausted</Tone> : <Tone tone="success">active</Tone>}</Td>
                      <Td>
                        <span className="flex gap-1">
                          <Link href={`/admin/promotions?edit=${c.id}`} className={`${adminButton.quiet} ${adminButton.sm}`}>
                            Edit
                          </Link>
                          <ConfirmButton label={c.isActive ? "Disable" : "Enable"} message={c.isActive ? "Stop accepting this code." : "Accept this code again."} action={toggleCouponAction.bind(null, c.id, !c.isActive)} size="sm" />
                          {c._count.redemptions === 0 && <ConfirmButton label="Delete" message="Delete this unused coupon?" action={deleteCouponAction.bind(null, c.id)} size="sm" variant="danger" />}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
        </div>
        <Card title={edit ? `Edit ${edit.code}` : "New coupon"} className="self-start" actions={edit ? <Link href="/admin/promotions" className="text-[13px] text-ink-600">Cancel</Link> : undefined}>
          <ActionForm key={edit?.id ?? "new"} action={saveCouponAction} hidden={edit ? { id: edit.id } : {}} submitLabel={edit ? "Save coupon" : "Create coupon"} resetOnSuccess={!edit}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code">
                <input name="code" required defaultValue={edit?.code ?? ""} className={`${adminInput} font-mono uppercase`} placeholder="SPRING10" />
              </Field>
              <Field label="Name (internal)">
                <input name="name" defaultValue={edit?.name ?? ""} className={adminInput} />
              </Field>
              <Field label="Type">
                <select name="type" defaultValue={edit?.type ?? "percent"} className={adminSelect}>
                  {COUPON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === "percent" ? "Percent off" : t === "fixed" ? "Fixed amount off" : "Free shipping"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Value" hint="Percent (10 = 10%) or USD">
                <input name="value" type="number" step="0.01" min={0} defaultValue={edit ? edit.value / 100 : ""} className={adminInput} />
              </Field>
              <Field label="Min order (USD)">
                <input name="minSubtotal" type="number" step="0.01" min={0} defaultValue={edit?.minSubtotal !== null && edit?.minSubtotal !== undefined ? edit.minSubtotal / 100 : ""} className={adminInput} />
              </Field>
              <Field label="Max discount (USD)">
                <input name="maxDiscount" type="number" step="0.01" min={0} defaultValue={edit?.maxDiscount !== null && edit?.maxDiscount !== undefined ? edit.maxDiscount / 100 : ""} className={adminInput} />
              </Field>
              <Field label="Total uses (blank = unlimited)">
                <input name="maxUses" type="number" min={0} defaultValue={edit?.maxUses ?? ""} className={adminInput} />
              </Field>
              <Field label="Per customer">
                <input name="perUserLimit" type="number" min={0} defaultValue={edit?.perUserLimit ?? ""} className={adminInput} />
              </Field>
              <Field label="Starts">
                <input name="startsAt" type="date" defaultValue={dateInput(edit?.startsAt)} className={adminInput} />
              </Field>
              <Field label="Ends">
                <input name="endsAt" type="date" defaultValue={dateInput(edit?.endsAt)} className={adminInput} />
              </Field>
              <Field label="Scope">
                <select name="scope" defaultValue={edit?.scope ?? "order"} className={adminSelect}>
                  {COUPON_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s === "order" ? "Whole order" : `Specific ${s}s`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Eligibility">
                <select name="eligibility" defaultValue={edit?.eligibility ?? "all"} className={adminSelect}>
                  <option value="all">Everyone</option>
                  <option value="new_customers">First order only</option>
                </select>
              </Field>
            </div>
            <Field label="Scope items" hint="Comma-separated SKUs / slugs / ids for product, category or seller scope.">
              <input name="scopeIds" defaultValue={scopeIds.join(", ")} className={adminInput} />
            </Field>
            <Field label="Restrict to seller (id or slug, optional)" hint="Seller-funded coupons only discount that seller's items.">
              <input name="sellerId" defaultValue={edit?.sellerId ?? ""} className={adminInput} />
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
