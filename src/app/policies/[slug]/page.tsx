import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Breadcrumbs, ButtonLink, Container, type Crumb } from "@/components/ui";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { formattedPolicyDate, getPolicy, policies } from "@/lib/policies";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return policies.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) {
    return pageMetadata({
      title: "Policy not found",
      description: "This policy page is no longer available.",
      path: `/policies/${slug}`,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: policy.title,
    description: policy.summary,
    path: `/policies/${policy.slug}`,
    keywords: policy.keywords,
    type: "article",
  });
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = getPolicy(slug);
  if (!policy) notFound();

  const index = policies.findIndex((p) => p.slug === policy.slug);
  const prev = index > 0 ? policies[index - 1] : null;
  const next = index < policies.length - 1 ? policies[index + 1] : null;

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Policies", href: "/policies" },
    { name: policy.nav, href: `/policies/${policy.slug}` },
  ];

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${site.url}/policies/${policy.slug}`,
    url: `${site.url}/policies/${policy.slug}`,
    name: policy.title,
    description: policy.summary,
    inLanguage: "en-US",
    isPartOf: { "@id": `${site.url}/#website` },
    about: { "@id": `${site.url}/#organization` },
    publisher: { "@id": `${site.url}/#organization` },
    datePublished: policy.updated,
    dateModified: policy.updated,
    hasPart: policy.sections.map((s) => ({
      "@type": "WebPageElement",
      name: s.heading,
      url: `${site.url}/policies/${policy.slug}#${s.id}`,
    })),
  };

  return (
    <>
      <JsonLd id="policy-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="policy-schema" data={articleJsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">Policy</p>
            <h1 className="mt-3 font-display text-[clamp(2rem,4.2vw,3.1rem)] font-semibold leading-[1.1] text-ink-950">
              {policy.title}
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">{policy.summary}</p>
            <p className="mt-5 text-[13px] text-ink-500">
              Last updated <time dateTime={policy.updated}>{formattedPolicyDate}</time> · Applies to{" "}
              {site.legalName}
            </p>
          </div>
        </Container>
      </section>

      <Container className="py-12 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
          <nav aria-label="On this page" className="lg:col-span-3 lg:order-2">
            <div className="lg:sticky lg:top-28">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">On this page</p>
              <ol className="mt-4 grid gap-2.5 border-l border-ink-200 pl-4 text-[14px]">
                {policy.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-ink-600 underline-offset-4 hover:text-brand-700 hover:underline">
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>

              <div className="mt-8 rounded-xl border border-ink-200 bg-ink-50 p-5">
                <p className="font-display text-[15px] font-semibold text-ink-950">Need a person?</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">
                  Policies answer the common case. For anything else, ask.
                </p>
                <ButtonLink href="/contact" variant="outline" size="sm" className="mt-4 w-full">
                  Contact us
                </ButtonLink>
              </div>
            </div>
          </nav>

          <article className="prose-doc lg:col-span-9 lg:order-1">
            {policy.sections.map((s) => (
              <section key={s.id} id={s.id}>
                <h2>{s.heading}</h2>
                {s.body}
              </section>
            ))}

            <hr className="my-12 border-ink-200" />
            <p className="text-[13px] text-ink-500">
              This policy forms part of our <Link href="/policies/terms-of-service">terms of service</Link>. Where a
              conflict arises between documents, the more specific document prevails. Questions about anything on this
              page go to <a href={`mailto:${site.email}`}>{site.email}</a>.
            </p>
          </article>
        </div>

        <nav
          aria-label="Policy navigation"
          className="mt-14 grid gap-4 border-t border-ink-200 pt-8 sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={`/policies/${prev.slug}`}
              className="rounded-xl border border-ink-200 bg-white p-5 transition-colors hover:border-brand-300"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Previous</span>
              <span className="mt-1.5 block font-display text-[17px] font-semibold text-ink-950">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={`/policies/${next.slug}`}
              className="rounded-xl border border-ink-200 bg-white p-5 text-right transition-colors hover:border-brand-300 sm:col-start-2"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Next</span>
              <span className="mt-1.5 block font-display text-[17px] font-semibold text-ink-950">{next.title}</span>
            </Link>
          )}
        </nav>
      </Container>
    </>
  );
}
