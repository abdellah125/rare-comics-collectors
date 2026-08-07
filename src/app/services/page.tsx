import Link from "next/link";
import type { Metadata } from "next";

import { Badge, Breadcrumbs, ButtonLink, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { serviceIcons, CheckIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { services } from "@/lib/services";
import { formatPrice, schemaPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Comic Grading, Pressing, Appraisal & Consignment Services",
  description:
    "Authorised CGC and CBCS submission at dealer rates, professional pressing, restoration detection, insurance-grade appraisal, consignment and insured vault storage. Pre-screening on every book.",
  path: "/services",
  keywords: [
    "comic grading service",
    "CGC submission center",
    "comic book pressing service",
    "comic restoration detection",
    "comic book appraisal",
    "comic consignment",
    "comic book storage",
  ],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "Services", href: "/services" },
];

export default function ServicesPage() {
  const serviceListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "VaultCollect collector services",
    numberOfItems: services.length,
    itemListElement: services.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Service",
        name: s.name,
        description: s.summary,
        url: `${site.url}/services/${s.slug}`,
        serviceType: s.name,
        provider: { "@id": `${site.url}/#organization` },
        areaServed: { "@type": "Country", name: "United States" },
        ...(s.price !== null && {
          offers: {
            "@type": "Offer",
            price: schemaPrice(s.price),
            priceCurrency: site.currency,
            url: `${site.url}/services/${s.slug}`,
          },
        }),
      },
    })),
  };

  return (
    <>
      <JsonLd id="services-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="services-list" data={serviceListJsonLd} />

      <section className="relative overflow-hidden border-b border-ink-800 bg-ink-950 text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(55% 60% at 80% 15%, rgba(16,185,129,.5), transparent 62%), radial-gradient(50% 50% at 10% 90%, rgba(245,158,11,.22), transparent 60%)",
          }}
        />
        <Container className="relative py-14 lg:py-20">
          <Breadcrumbs items={crumbs} tone="dark" />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">Collector services</p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.08]">
              Grading, pressing, appraisal and everything else your collection needs
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-300">
              We have handled more than 180,000 books since {site.founded} — for collectors sending a single key, and
              for estates liquidating forty thousand issues. Every service below is run in-house by our own graders,
              not brokered out.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/services/grading-submission" size="lg" variant="primary">
                Start a grading submission
              </ButtonLink>
              <ButtonLink href="/contact" size="lg" variant="ghostLight">
                Talk to a grader
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-2">
          {services.map((s) => {
            const Icon = serviceIcons[s.icon];
            return (
              <article
                key={s.slug}
                className="group relative flex flex-col rounded-2xl border border-ink-200 bg-white p-7 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="text-right">
                    <p className="font-display text-xl font-semibold text-ink-950">
                      {s.price === null ? "Quoted" : formatPrice(s.price)}
                    </p>
                    <p className="text-xs text-ink-500">{s.priceNote}</p>
                  </div>
                </div>

                <h2 className="mt-5 font-display text-xl font-semibold text-ink-950">
                  <Link href={`/services/${s.slug}`}>
                    <span className="absolute inset-0" aria-hidden />
                    {s.name}
                  </Link>
                </h2>

                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-600">{s.summary}</p>

                <ul className="mt-5 grid gap-2">
                  {s.includes.slice(0, 4).map((inc) => (
                    <li key={inc} className="flex items-start gap-2.5 text-[14px] text-ink-700">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      {inc}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-4">
                  <Badge tone="neutral">Turnaround: {s.turnaround}</Badge>
                  <span className="text-sm font-semibold text-brand-700 group-hover:underline">
                    Full details →
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </Container>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Why in-house matters"
          title="Most dealers broker these services out. We don't."
          lead="When grading, pressing and appraisal all happen under one roof, one person is accountable for the outcome — and nobody is incentivised to submit a book that shouldn't be submitted."
          align="center"
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[
            {
              title: "We tell you not to grade",
              body: "Roughly one in three books we pre-screen gets sent back ungraded because the tier fee would exceed the value gain. That advice costs us revenue and saves you money.",
            },
            {
              title: "One accountable party",
              body: "Press, submission and shipping are all ours. If a book is damaged in the process, there is no finger-pointing between vendors — we cover it.",
            },
            {
              title: "Fully insured, end to end",
              body: "Your books are scheduled on our $60M policy from the moment we sign for them until they are back in your hands.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border border-ink-200 bg-white p-6">
              <h3 className="font-display text-lg font-semibold text-ink-950">{c.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-ink-600">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="dark">
        <div className="flex flex-col items-center text-center">
          <SectionHeading
            tone="dark"
            align="center"
            eyebrow="Not sure where to start?"
            title="Send us photos. We'll tell you what's worth doing."
            lead="No obligation, no sales pitch. Most enquiries get a written answer within two business days, including a rough value range and whether grading makes financial sense."
          />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact" size="lg" variant="gold">
              Request a free assessment
            </ButtonLink>
            <ButtonLink href="/support" size="lg" variant="ghostLight">
              Contact support
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
