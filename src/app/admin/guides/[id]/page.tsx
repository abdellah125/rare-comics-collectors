import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminGuideForm, type GuideFormValues } from "@/components/admin/guide-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { deleteGuideAction, setGuideStatusAction } from "@/lib/admin/actions/guides";
import { db } from "@/lib/db";
import { isString, parseJsonArray } from "@/lib/json";

export const metadata: Metadata = { title: "Edit guide" };

export default async function EditGuidePage({ params, searchParams }: PageProps<"/admin/guides/[id]">) {
  await requireAdmin("content.manage");
  const { id } = await params;
  const sp = await searchParams;
  const row = await db.article.findUnique({ where: { id } });
  if (!row) notFound();
  const strings = (json: string) => parseJsonArray(json, isString);
  const initial: GuideFormValues = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    answer: row.answer,
    body: row.body,
    topic: row.topic,
    tags: strings(row.tagsJson),
    characters: strings(row.charactersJson),
    titles: strings(row.titlesJson),
    publishers: strings(row.publishersJson),
    faq: parseJsonArray(row.faqJson, (v): v is { q: string; a: string } => typeof v === "object" && v !== null && "q" in v && "a" in v),
    related: strings(row.relatedJson),
    sources: parseJsonArray(row.sourcesJson, (v): v is { label: string; url?: string } => typeof v === "object" && v !== null && "label" in v),
    status: row.status,
    eventDate: row.eventDate ? row.eventDate.toISOString().slice(0, 10) : null,
    authorName: row.authorName,
  };
  return (
    <>
      <AdminPageHeader
        title={row.title}
        lead={`${row.status === "published" ? "Published" : "Draft"} · /guides/${row.slug}${sp.created ? " · created" : ""}`}
        actions={
          <>
            {row.status === "published" ? (
              <ConfirmButton label="Unpublish" message="Take this guide off the site? It stays here as a draft." action={() => setGuideStatusAction(row.id, "draft")} />
            ) : (
              <ConfirmButton label="Publish" message="Publish this guide now? It will appear in the guides hub, sitemaps and related-guide blocks." action={() => setGuideStatusAction(row.id, "published")} variant="primary" />
            )}
            <ConfirmButton label="Delete" message="Delete this guide permanently? Links to it will 404." action={() => deleteGuideAction(row.id)} variant="danger" />
          </>
        }
      />
      <AdminGuideForm initial={initial} />
    </>
  );
}
