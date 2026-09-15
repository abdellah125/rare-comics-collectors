"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { actorOf, runAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db";
import { ArticleInput, type ArticleInputValues } from "@/lib/guides/schema";
import { pingIndexNow } from "@/lib/indexnow";
import { failState, fieldErrors, formToObject, okState, slugify, type ActionState } from "@/lib/validation";

const GUIDE_PATHS = ["/guides", "/characters", "/sitemap.xml", "/sitemaps/site.xml"];

function toRecord(v: ArticleInputValues, slug: string) {
  return {
    slug,
    title: v.title,
    answer: v.answer,
    body: v.body,
    topic: v.topic,
    tagsJson: JSON.stringify(v.tags),
    charactersJson: JSON.stringify(v.characters),
    titlesJson: JSON.stringify(v.titles),
    publishersJson: JSON.stringify(v.publishers),
    faqJson: JSON.stringify(v.faq),
    relatedJson: JSON.stringify(v.related),
    sourcesJson: JSON.stringify(v.sources),
    status: v.status,
    eventDate: v.eventDate ?? null,
    authorName: v.authorName || null,
  };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base).slice(0, 110) || "guide";
  let slug = root;
  for (let n = 2; ; n++) {
    const clash = await db.article.findUnique({ where: { slug }, select: { id: true } });
    if (!clash || clash.id === excludeId) return slug;
    slug = `${root}-${n}`;
  }
}

async function afterChange(slug: string, oldSlug?: string) {
  for (const p of [...GUIDE_PATHS, `/guides/${slug}`, ...(oldSlug && oldSlug !== slug ? [`/guides/${oldSlug}`] : [])]) revalidatePath(p);
  await pingIndexNow([`/guides/${slug}`, "/guides"]);
}

export async function saveGuideAction(_prev: ActionState<{ id: string }> | undefined, formData: FormData): Promise<ActionState<{ id: string }>> {
  let createdId: string | null = null;
  const result = await runAdmin<{ id: string }>("content.manage", async (admin) => {
    const raw = formToObject(formData);
    const parsed = ArticleInput.safeParse(raw);
    if (!parsed.success) return failState("Check the highlighted fields.", fieldErrors(parsed.error));
    const v = parsed.data;
    const id = typeof raw.id === "string" && raw.id ? raw.id : null;
    const existing = id ? await db.article.findUnique({ where: { id } }) : null;
    if (id && !existing) return failState("Guide not found.");
    const slug = await uniqueSlug(v.slug || v.title, existing?.id);
    const data = toRecord(v, slug);
    const publishedAt = v.status === "published" ? (existing?.publishedAt ?? v.publishedAt ?? new Date()) : (existing?.publishedAt ?? null);
    const row = existing ? await db.article.update({ where: { id: existing.id }, data: { ...data, publishedAt } }) : await db.article.create({ data: { ...data, publishedAt } });
    await audit({ actor: actorOf(admin), action: existing ? "guide.update" : "guide.create", targetType: "article", targetId: row.id, summary: `${existing ? "Edited" : "Created"} guide “${row.title}” (${row.status})`, before: existing ? { status: existing.status, slug: existing.slug } : undefined, after: { status: row.status, slug: row.slug } });
    await afterChange(row.slug, existing?.slug);
    revalidatePath(`/admin/guides/${row.id}`);
    if (!existing) createdId = row.id;
    return okState({ id: row.id }, existing ? "Guide saved." : "Guide created.");
  });
  if (result.ok && createdId) redirect(`/admin/guides/${createdId}?created=1`);
  return result;
}

export async function setGuideStatusAction(id: string, status: "draft" | "published"): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const row = await db.article.findUnique({ where: { id } });
    if (!row) return failState("Guide not found.");
    const updated = await db.article.update({ where: { id }, data: { status, publishedAt: status === "published" ? (row.publishedAt ?? new Date()) : row.publishedAt } });
    await audit({ actor: actorOf(admin), action: `guide.${status === "published" ? "publish" : "unpublish"}`, targetType: "article", targetId: id, summary: `“${row.title}”: ${row.status} → ${status}` });
    await afterChange(updated.slug);
    revalidatePath(`/admin/guides/${id}`);
    revalidatePath("/admin/guides");
    return okState(undefined, status === "published" ? "Published." : "Unpublished.");
  });
}

export async function deleteGuideAction(id: string): Promise<ActionState> {
  return runAdmin("content.manage", async (admin) => {
    const row = await db.article.findUnique({ where: { id } });
    if (!row) return failState("Guide not found.");
    await db.article.delete({ where: { id } });
    await audit({ actor: actorOf(admin), action: "guide.delete", targetType: "article", targetId: id, summary: `Deleted guide “${row.title}”` });
    await afterChange(row.slug);
    revalidatePath("/admin/guides");
    return okState(undefined, "Guide deleted.");
  });
}

/**
 * Bulk import: a JSON array of articles in the same shape as the admin form
 * (see prisma/data/guides/*.json). Existing slugs are updated, new ones created.
 */
export async function importGuidesAction(_prev: ActionState<{ created: number; updated: number; errors: string[] }> | undefined, formData: FormData): Promise<ActionState<{ created: number; updated: number; errors: string[] }>> {
  return runAdmin("content.manage", async (admin) => {
    const file = formData.get("file");
    const text = file instanceof File && file.size > 0 ? await file.text() : String(formData.get("json") ?? "");
    if (!text.trim()) return failState("Paste JSON or choose a file.");
    if (text.length > 5 * 1024 * 1024) return failState("Import is limited to 5 MB per batch.");
    let items: unknown;
    try {
      items = JSON.parse(text);
    } catch {
      return failState("That is not valid JSON.");
    }
    if (!Array.isArray(items)) return failState("The JSON must be an array of articles.");
    if (items.length > 1000) return failState("Import at most 1,000 articles per batch.");
    const publish = formData.get("publish") === "on";
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    const touched: string[] = [];
    for (const [i, item] of items.entries()) {
      const parsed = ArticleInput.safeParse(item);
      if (!parsed.success) {
        errors.push(`Item ${i + 1}: ${Object.entries(fieldErrors(parsed.error)).map(([k, m]) => `${k} — ${m}`).join("; ")}`);
        continue;
      }
      const v = parsed.data;
      const wanted = v.slug || slugify(v.title);
      const existing = await db.article.findUnique({ where: { slug: wanted } });
      const status = publish ? "published" : v.status;
      const data = { ...toRecord({ ...v, status }, existing ? existing.slug : await uniqueSlug(wanted)) };
      if (existing) {
        await db.article.update({ where: { id: existing.id }, data: { ...data, publishedAt: status === "published" ? (existing.publishedAt ?? v.publishedAt ?? new Date()) : existing.publishedAt } });
        updated += 1;
      } else {
        await db.article.create({ data: { ...data, publishedAt: status === "published" ? (v.publishedAt ?? new Date()) : null } });
        created += 1;
      }
      touched.push(data.slug);
    }
    await audit({ actor: actorOf(admin), action: "guide.import", targetType: "article", summary: `Imported guides: ${created} created, ${updated} updated, ${errors.length} rejected` });
    for (const p of GUIDE_PATHS) revalidatePath(p);
    for (const s of touched) revalidatePath(`/guides/${s}`);
    if (touched.length) await pingIndexNow([...touched.map((s) => `/guides/${s}`), "/guides"]);
    revalidatePath("/admin/guides");
    return okState({ created, updated, errors }, `${created} created, ${updated} updated${errors.length ? `, ${errors.length} rejected` : ""}.`);
  });
}
