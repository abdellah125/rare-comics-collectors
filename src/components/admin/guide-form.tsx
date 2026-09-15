"use client";

import { useActionState } from "react";
import { Field, adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { saveGuideAction } from "@/lib/admin/actions/guides";
import { GUIDE_TOPICS } from "@/lib/guides/topics";
import type { ActionState } from "@/lib/validation";

export type GuideFormValues = {
  id: string;
  slug: string;
  title: string;
  answer: string;
  body: string;
  topic: string;
  tags: string[];
  characters: string[];
  titles: string[];
  publishers: string[];
  faq: { q: string; a: string }[];
  related: string[];
  sources: { label: string; url?: string }[];
  status: string;
  eventDate: string | null;
  authorName: string | null;
};

export function AdminGuideForm({ initial }: { initial: GuideFormValues | null }) {
  const [state, formAction, pending] = useActionState(saveGuideAction as (prev: ActionState<{ id: string }> | undefined, fd: FormData) => Promise<ActionState<{ id: string }>>, undefined);
  const errors = state && !state.ok ? (state.errors ?? {}) : {};
  const err = (k: string) => errors[k];
  const cls = (k: string, base = adminInput) => `${base} ${err(k) ? "border-rose-400" : ""}`;

  return (
    <form action={formAction} className="grid gap-5" aria-busy={pending}>
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 lg:col-span-2">
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Question and answer</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Title (the question or headline)" hint={err("title") ?? "Write it the way a collector would type it: “What is a CGC graded comic?”"}>
                <input name="title" required defaultValue={initial?.title ?? ""} className={cls("title")} maxLength={160} />
              </Field>
              <Field label="Direct answer" hint={err("answer") ?? "One paragraph, 40–700 characters. Shown at the top of the page and used as the meta description."}>
                <textarea name="answer" required rows={3} defaultValue={initial?.answer ?? ""} className={cls("answer", adminTextarea)} maxLength={700} />
              </Field>
              <Field label="Body (Markdown)" hint={err("body") ?? "## headings, paragraphs, - bullets, 1. numbered lists, **bold**, [links](/store). Link to listings, publishers, characters and other guides where it helps the reader."}>
                <textarea name="body" required rows={22} defaultValue={initial?.body ?? ""} className={`${cls("body", adminTextarea)} font-mono text-[13px]`} />
              </Field>
            </div>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Frequently asked (optional)</h2>
            <Field label="JSON array of { q, a }" hint={err("faq") ?? 'Example: [{"q":"Is CGC better than CBCS?","a":"Neither is objectively better…"}]'} className="mt-3">
              <textarea name="faq" rows={6} defaultValue={initial ? JSON.stringify(initial.faq, null, 2) : "[]"} className={`${cls("faq", adminTextarea)} font-mono text-[13px]`} />
            </Field>
            <Field label="Sources (one per line: Label | https://url)" hint={err("sources")} className="mt-3">
              <textarea name="sources" rows={3} defaultValue={initial?.sources.map((s) => (s.url ? `${s.label} | ${s.url}` : s.label)).join("\n") ?? ""} className={cls("sources", adminTextarea)} />
            </Field>
          </section>
        </div>
        <div className="grid gap-5 content-start">
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Publishing</h2>
            <div className="mt-3 grid gap-3">
              <Field label="Status">
                <select name="status" defaultValue={initial?.status ?? "draft"} className={adminSelect}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </Field>
              <Field label="Topic" hint={err("topic")}>
                <select name="topic" defaultValue={initial?.topic ?? "faq"} className={adminSelect}>
                  {GUIDE_TOPICS.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Slug" hint={err("slug") ?? "Leave blank to derive from the title."}>
                <input name="slug" defaultValue={initial?.slug ?? ""} className={cls("slug")} placeholder="what-is-a-cgc-graded-comic" />
              </Field>
              <Field label="Event date (news and history)" hint={err("eventDate")}>
                <input name="eventDate" type="date" defaultValue={initial?.eventDate ?? ""} className={cls("eventDate")} />
              </Field>
              <Field label="Author (optional)">
                <input name="authorName" defaultValue={initial?.authorName ?? ""} className={adminInput} />
              </Field>
            </div>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-ink-950">Linking</h2>
            <p className="mt-1 text-[12px] text-ink-500">Comma-separated. These connect the guide to listings, character pages and publisher pages.</p>
            <div className="mt-3 grid gap-3">
              <Field label="Characters" hint={err("characters")}>
                <input name="characters" defaultValue={initial?.characters.join(", ") ?? ""} className={cls("characters")} placeholder="Wolverine, Hulk" />
              </Field>
              <Field label="Comic titles" hint={err("titles")}>
                <input name="titles" defaultValue={initial?.titles.join(", ") ?? ""} className={cls("titles")} placeholder="Incredible Hulk" />
              </Field>
              <Field label="Publishers" hint={err("publishers")}>
                <input name="publishers" defaultValue={initial?.publishers.join(", ") ?? ""} className={cls("publishers")} placeholder="Marvel Comics" />
              </Field>
              <Field label="Tags" hint={err("tags")}>
                <input name="tags" defaultValue={initial?.tags.join(", ") ?? ""} className={cls("tags")} placeholder="Bronze Age, CGC, key issue" />
              </Field>
              <Field label="Related guide slugs" hint={err("related")}>
                <input name="related" defaultValue={initial?.related.join(", ") ?? ""} className={cls("related")} />
              </Field>
            </div>
          </section>
          {state?.message && <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={adminButton.primary}>
              {pending ? "Saving…" : initial ? "Save guide" : "Create guide"}
            </button>
            {initial?.status === "published" && (
              <a href={`/guides/${initial.slug}`} target="_blank" rel="noreferrer" className={adminButton.outline}>
                View live
              </a>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
