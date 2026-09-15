import type { Metadata } from "next";
import Link from "next/link";
import { Pagination, SortLink } from "@/components/admin/pagination";
import { AdminPageHeader, EmptyState, Field, FilterBar, Table, Td, Th, adminButton, adminInput, adminSelect } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { listParams, pageCount } from "@/lib/admin/query";
import { db, type Prisma } from "@/lib/db";
import { GUIDE_TOPICS } from "@/lib/guides/topics";
import { formatDateTime } from "@/lib/i18n";

export const metadata: Metadata = { title: "Guides & articles" };
const SORTS = ["updatedAt", "publishedAt", "title", "topic", "status"] as const;

export default async function AdminGuidesPage({ searchParams }: PageProps<"/admin/guides">) {
  await requireAdmin("content.manage");
  const sp = await searchParams;
  const p = listParams(sp, { defaultSort: "updatedAt", sorts: SORTS });
  const status = p.get("status");
  const topic = p.get("topic");
  const where: Prisma.ArticleWhereInput = {
    ...(status ? { status } : {}),
    ...(topic ? { topic } : {}),
    ...(p.q ? { OR: [{ title: { contains: p.q, mode: "insensitive" as const } }, { slug: { contains: p.q, mode: "insensitive" as const } }, { charactersJson: { contains: p.q, mode: "insensitive" as const } }, { titlesJson: { contains: p.q, mode: "insensitive" as const } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.article.findMany({ where, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.per, select: { id: true, slug: true, title: true, topic: true, status: true, publishedAt: true, updatedAt: true } }),
    db.article.count({ where }),
    db.article.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const base = "/admin/guides";
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const topicName = (slug: string) => GUIDE_TOPICS.find((t) => t.slug === slug)?.short ?? slug;
  return (
    <>
      <AdminPageHeader
        title="Guides & articles"
        lead={`${total.toLocaleString("en-US")} articles · ${countOf("published")} published · ${countOf("draft")} drafts`}
        actions={
          <>
            <Link href="/admin/guides/import" className={adminButton.outline}>
              Import JSON
            </Link>
            <Link href="/admin/guides/new" className={adminButton.primary}>
              + New guide
            </Link>
          </>
        }
      />
      <FilterBar action={base} reset>
        <Field label="Search" className="min-w-[220px] flex-1">
          <input name="q" defaultValue={p.q} placeholder="Title, slug, character, comic title" className={adminInput} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className={adminSelect}>
            <option value="">Any</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </Field>
        <Field label="Topic">
          <select name="topic" defaultValue={topic} className={adminSelect}>
            <option value="">Any</option>
            {GUIDE_TOPICS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState title="No guides match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>
                <SortLink base={base} params={p.params} sortKey="title" label="Title" current={p.sort} dir={p.dir} />
              </Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="topic" label="Topic" current={p.sort} dir={p.dir} />
              </Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="status" label="Status" current={p.sort} dir={p.dir} />
              </Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="publishedAt" label="Published" current={p.sort} dir={p.dir} />
              </Th>
              <Th>
                <SortLink base={base} params={p.params} sortKey="updatedAt" label="Updated" current={p.sort} dir={p.dir} />
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/admin/guides/${r.id}`} className="font-medium text-ink-950 hover:text-brand-700">
                    {r.title}
                  </Link>
                  <span className="block text-[11px] text-ink-500">/guides/{r.slug}</span>
                </Td>
                <Td>{topicName(r.topic)}</Td>
                <Td>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === "published" ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-700"}`}>{r.status}</span>
                </Td>
                <Td>{r.publishedAt ? formatDateTime(r.publishedAt, { dateOnly: true }) : "—"}</Td>
                <Td>{formatDateTime(r.updatedAt, { dateOnly: true })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pagination base={base} params={p.params} page={p.page} pages={pageCount(total, p.per)} total={total} per={p.per} />
    </>
  );
}
