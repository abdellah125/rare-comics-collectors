import Link from "next/link";
import type { Metadata } from "next";

import { Breadcrumbs, ButtonLink, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { ShieldIcon, TruckIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";
import { formattedPolicyDate, policies } from "@/lib/policies";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Policies & Customer Protections",
  description: `Shipping, returns, authenticity guarantee, grading service terms, privacy, terms of service, cookies and accessibility — every ${site.name} policy in plain English, dated and public.`,
  path: "/policies",
  keywords: [
    "comic store policies",
    "comic shipping policy",
    "comic return policy",
    "authenticity guarantee",
    "grading terms",
  ],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Policies", href: "/policies" },
];

const highlights = [
  {
    icon: ShieldIcon,
    title: "Lifetime authenticity guarantee",
    body: "Full refund if a book is ever shown to be counterfeit or materially misdescribed. No expiry, and it transfers with a documented resale.",
    href: "/policies/authenticity-guarantee",
  },
  {
    icon: TruckIcon,
    title: "14-day inspection window",
    body: "Return any purchase within 14 days of delivery for a full refund. No restocking fee, and no justification required.",
    href: "/policies/returns-and-refunds",
  },
];

export default function PoliciesPage() {
  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${site.name} Policies`,
    url: `${site.url}/policies`,
    isPartOf: { "@id": `${site.url}/#website` },
    about: { "@id": `${site.url}/#organization` },
    hasPart: policies.map((p) => ({
      "@type": "WebPage",
      "@id": `${site.url}/policies/${p.slug}`,
      url: `${site.url}/policies/${p.slug}`,
      name: p.title,
      description: p.summary,
      dateModified: p.updated,
    })),
  };

  return (
    <>
      <JsonLd id="policies-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="policies-schema" data={collectionJsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">The fine print</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.08] text-ink-950">
              Policies, written to be read
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
              No dark patterns, no clauses buried on page nine. These are the documents our team actually works from,
              published in full and dated. All eight were last reviewed on {formattedPolicyDate}.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {highlights.map((h) => (
              <Link
                key={h.title}
                href={h.href}
                className="group rounded-xl border border-ink-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-plate"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <h.icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">
                  {h.title}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-600">{h.body}</p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <SectionHeading
          eyebrow="Full library"
          title="Every policy in one place"
          lead="Each document is a standalone page with its own table of contents, so you can link a colleague straight to the clause that matters."
        />

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {policies.map((p, i) => (
            <article
              key={p.slug}
              className="group relative flex flex-col rounded-xl border border-ink-200 bg-white p-6 transition-all hover:border-brand-300 hover:shadow-plate"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-lg font-semibold text-ink-950 group-hover:text-brand-700">
                  <Link href={`/policies/${p.slug}`} className="after:absolute after:inset-0">
                    {p.title}
                  </Link>
                </h3>
                <span className="shrink-0 font-mono text-[11px] text-ink-500" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-600">{p.summary}</p>
              <p className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4 text-[12px] text-ink-500">
                <span>
                  {p.sections.length} section{p.sections.length === 1 ? "" : "s"}
                </span>
                <span>Updated {formattedPolicyDate}</span>
              </p>
            </article>
          ))}
        </div>
      </Container>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Questions"
          title="Something here unclear?"
          lead="If a policy does not answer your question, that is a fault in the policy and we would like to fix it. Ask us and we will both answer you and rewrite the clause."
          align="center"
        />
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/faq" variant="primary" size="lg">
            Read the FAQ
          </ButtonLink>
          <ButtonLink href="/contact" variant="outline" size="lg">
            Contact us
          </ButtonLink>
        </div>
      </Section>
    </>
  );
}
