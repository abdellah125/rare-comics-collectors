import Link from "next/link";
import type { GuideSummary } from "@/lib/guides/data";
import { GUIDE_TOPICS } from "@/lib/guides/topics";
import { formatDateTime } from "@/lib/i18n";

const topicShort = (slug: string) => GUIDE_TOPICS.find((t) => t.slug === slug)?.short ?? slug;

/** A question-style card linking to a guide; the direct answer is the excerpt. */
export function GuideCard({ guide, compact = false }: { guide: GuideSummary; compact?: boolean }) {
  return (
    <article className="group relative flex h-full flex-col rounded-xl border border-ink-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">{topicShort(guide.topic)}</p>
      <h3 className={`mt-2 font-display font-semibold leading-snug text-ink-950 ${compact ? "text-[17px]" : "text-lg"}`}>
        <Link href={`/guides/${guide.slug}`} className="hover:text-brand-700">
          <span className="absolute inset-0" aria-hidden />
          {guide.title}
        </Link>
      </h3>
      <p className={`mt-2 flex-1 text-[14px] leading-relaxed text-ink-600 ${compact ? "line-clamp-3" : "line-clamp-4"}`}>{guide.answer}</p>
      {guide.publishedAt && <p className="mt-4 text-[12px] text-ink-500">Updated {formatDateTime(guide.updatedAt, { dateOnly: true })}</p>}
    </article>
  );
}

export function GuideGrid({ guides, compact = false, columns = 3 }: { guides: GuideSummary[]; compact?: boolean; columns?: 2 | 3 | 4 }) {
  if (guides.length === 0) return null;
  const cols = columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : columns === 2 ? "md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <ul className={`grid gap-4 ${cols}`}>
      {guides.map((g) => (
        <li key={g.id}>
          <GuideCard guide={g} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

/** "Read more" block for product, collection, publisher and character pages. */
export function RelatedGuides({ guides, heading = "Guides & background", lead }: { guides: GuideSummary[]; heading?: string; lead?: string }) {
  if (guides.length === 0) return null;
  return (
    <section aria-labelledby="related-guides">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="related-guides" className="font-display text-2xl font-semibold text-ink-950">
            {heading}
          </h2>
          {lead && <p className="mt-1 text-[14px] text-ink-600">{lead}</p>}
        </div>
        <Link href="/guides" className="text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
          All guides →
        </Link>
      </div>
      <div className="mt-5">
        <GuideGrid guides={guides} compact columns={guides.length >= 4 ? 4 : 3} />
      </div>
    </section>
  );
}
