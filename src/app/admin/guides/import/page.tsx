import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { AdminPageHeader, Field, adminTextarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth/session";
import { importGuidesAction } from "@/lib/admin/actions/guides";

export const metadata: Metadata = { title: "Import guides" };

const example = `[
  {
    "slug": "what-is-a-cgc-graded-comic",
    "title": "What is a CGC graded comic?",
    "answer": "A CGC graded comic is a book that CGC has authenticated, graded on the 0.5–10 scale and sealed in a tamper-evident holder with a label recording the grade, page quality and any restoration.",
    "body": "## What the label tells you\\n\\nParagraphs in Markdown…",
    "topic": "grading",
    "tags": ["CGC", "grading"],
    "characters": [],
    "titles": [],
    "publishers": [],
    "faq": [{ "q": "Can a CGC grade change?", "a": "Only if the book is resubmitted…" }],
    "sources": [{ "label": "CGC grading scale", "url": "https://www.cgccomics.com/" }],
    "status": "published",
    "publishedAt": "2026-09-14"
  }
]`;

export default async function ImportGuidesPage() {
  await requireAdmin("content.manage");
  return (
    <>
      <AdminPageHeader title="Import guides" lead="Paste or upload a JSON array of articles (up to 1,000 per batch, 5 MB). Existing slugs are updated in place; new slugs are created. Articles are validated one by one and the rejects are listed with the reason." />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActionForm action={importGuidesAction} submitLabel="Import">
            {(errors) => (
              <div className="grid gap-4 rounded-xl border border-ink-200 bg-white p-5">
                <Field label="JSON" hint={errors.json}>
                  <textarea name="json" rows={18} className={`${adminTextarea} font-mono text-[13px]`} placeholder={example} />
                </Field>
                <Field label="…or upload a .json file">
                  <input name="file" type="file" accept="application/json,.json" className="text-sm" />
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink-800">
                  <input type="checkbox" name="publish" /> Publish everything in this batch (otherwise each article&apos;s own status applies)
                </label>
              </div>
            )}
          </ActionForm>
        </div>
        <aside className="rounded-xl border border-ink-200 bg-ink-50 p-5 text-[13px] leading-relaxed text-ink-700">
          <h2 className="font-semibold text-ink-950">Fields</h2>
          <ul className="mt-2 grid gap-1">
            <li>
              <strong>title</strong> — the question or headline (8–160 chars)
            </li>
            <li>
              <strong>answer</strong> — the direct answer (40–700 chars; also the meta description)
            </li>
            <li>
              <strong>body</strong> — Markdown (headings, lists, links)
            </li>
            <li>
              <strong>topic</strong> — grading, collecting, values, characters, titles, publishers, care, news, faq
            </li>
            <li>
              <strong>characters / titles / publishers / tags</strong> — arrays used for internal linking
            </li>
            <li>
              <strong>faq</strong> — optional array of {"{ q, a }"}; <strong>sources</strong> — optional array of {"{ label, url }"}
            </li>
            <li>
              <strong>eventDate</strong> — for news and history (YYYY-MM-DD); <strong>publishedAt</strong> optional
            </li>
          </ul>
          <p className="mt-3">Every article must answer a real question with accurate, sourced facts. Never invent dates, prices or sales.</p>
        </aside>
      </div>
    </>
  );
}
