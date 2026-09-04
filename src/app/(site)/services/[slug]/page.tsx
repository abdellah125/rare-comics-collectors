import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { AddToCartButton, BuyNowButton } from "@/components/buy-buttons";
import { serviceToLine } from "@/lib/cart-lines";
import { Badge, Breadcrumbs, ButtonLink, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { serviceIcons, CheckIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd, faqJsonLd } from "@/components/json-ld";
import { getService, services } from "@/lib/services";
import { formatPrice, schemaPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) {
    return pageMetadata({
      title: "Service not found",
      description: "This service page is no longer available.",
      path: `/services/${slug}`,
      noIndex: true,
    });
  }
  return pageMetadata({
    title: `${service.name} — ${service.price === null ? "Quoted" : formatPrice(service.price)}`,
    description: `${service.summary} Turnaround ${service.turnaround}. ${site.name}, ${site.address.city} ${site.address.region}.`,
    path: `/services/${service.slug}`,
    keywords: [service.name.toLowerCase(), service.short.toLowerCase(), "comic book services", `${site.address.city} comic grading`],
  });
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  const Icon = serviceIcons[service.icon];
  const others = services.filter((s) => s.slug !== service.slug).slice(0, 3);
  const line = serviceToLine(service);

  const crumbs: Crumb[] = [
    { name: "Home", href: "/" },
    { name: "Services", href: "/services" },
    { name: service.name, href: `/services/${service.slug}` },
  ];

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${site.url}/services/${service.slug}#service`,
    name: service.name,
    serviceType: service.name,
    description: service.summary,
    url: `${site.url}/services/${service.slug}`,
    provider: { "@id": `${site.url}/#organization` },
    areaServed: { "@type": "Country", name: "United States" },
    audience: { "@type": "Audience", audienceType: "Comic book collectors and investors" },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${service.name} inclusions`,
      itemListElement: service.includes.map((inc) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: inc },
      })),
    },
    ...(service.price !== null && {
      offers: {
        "@type": "Offer",
        price: schemaPrice(service.price),
        priceCurrency: site.currency,
        availability: "https://schema.org/InStock",
        url: `${site.url}/services/${service.slug}`,
        seller: { "@id": `${site.url}/#organization` },
      },
    }),
  };

  return (
    <>
      <JsonLd id="service-schema" data={serviceJsonLd} />
      <JsonLd id="service-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="service-faq" data={faqJsonLd(service.faqs)} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-10 lg:py-14">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-white shadow-plate">
                <Icon className="h-6 w-6" />
              </span>
              <h1 className="mt-5 font-display text-[clamp(2rem,4.2vw,3rem)] font-semibold leading-[1.1] text-ink-950">
                {service.name}
              </h1>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-700">{service.summary}</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge tone="brand">Turnaround: {service.turnaround}</Badge>
                <Badge tone="neutral">Insured end to end</Badge>
                <Badge tone="neutral">Pre-screened before submission</Badge>
              </div>
            </div>

            {/* Booking card */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-plate">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Pricing</p>
                <p className="mt-2 font-display text-3xl font-semibold text-ink-950">
                  {service.price === null ? "Quoted" : formatPrice(service.price)}
                </p>
                <p className="mt-1 text-sm text-ink-600">{service.priceNote}</p>

                <div className="mt-6 grid gap-2.5">
                  {service.price === null ? (
                    <>
                      <ButtonLink href="/contact" size="lg" variant="primary" className="w-full">
                        Request a quote
                      </ButtonLink>
                      <ButtonLink href="/support" size="md" variant="outline" className="w-full">
                        Ask a question
                      </ButtonLink>
                    </>
                  ) : (
                    <>
                      <BuyNowButton line={line} label="Book & pay now" className="w-full" />
                      <AddToCartButton line={line} label="Add service to cart" className="w-full" />
                    </>
                  )}
                </div>

                <p className="mt-4 text-xs leading-relaxed text-ink-500">
                  Booking reserves your slot and ships your submission kit. Grader tier fees, if any, are invoiced
                  separately once you approve the per-book recommendations — nothing is submitted without your
                  sign-off.
                </p>

                <dl className="mt-6 grid gap-3 border-t border-ink-100 pt-5 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Turnaround</dt>
                    <dd className="text-right font-medium text-ink-900">{service.turnaround}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Shipping</dt>
                    <dd className="text-right font-medium text-ink-900">Insured both ways</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Drop-off</dt>
                    <dd className="text-right font-medium text-ink-900">{site.address.city}, {site.address.region}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold text-ink-950">What this service is</h2>
            <div className="prose-doc mt-4">
              {service.description.map((p) => (
                <p key={p.slice(0, 30)}>{p}</p>
              ))}
            </div>

            <h2 className="mt-12 font-display text-2xl font-semibold text-ink-950">How it works</h2>
            <ol className="mt-6 grid gap-5">
              {service.steps.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-950 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink-950">{step.title}</h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <h2 className="mt-12 font-display text-2xl font-semibold text-ink-950">Frequently asked</h2>
            <div className="mt-5 divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200">
              {service.faqs.map((f) => (
                <details key={f.q} className="group bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold text-ink-950 hover:bg-ink-50">
                    {f.q}
                    <span
                      aria-hidden
                      className="shrink-0 text-xl leading-none text-ink-400 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[15px] leading-relaxed text-ink-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <h2 className="font-display text-2xl font-semibold text-ink-950">What&apos;s included</h2>
              <ul className="mt-5 grid gap-3 rounded-xl border border-ink-200 bg-ink-50 p-6">
                {service.includes.map((inc) => (
                  <li key={inc} className="flex items-start gap-3 text-[15px] leading-snug text-ink-800">
                    <CheckIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand-600" />
                    {inc}
                  </li>
                ))}
              </ul>

              <div className="mt-6 rounded-xl border border-ink-200 bg-white p-6">
                <h3 className="font-display text-lg font-semibold text-ink-950">Other services</h3>
                <ul className="mt-4 grid gap-3">
                  {others.map((o) => (
                    <li key={o.slug}>
                      <Link
                        href={`/services/${o.slug}`}
                        className="flex items-center justify-between gap-3 text-[15px] text-ink-700 hover:text-brand-700"
                      >
                        <span>{o.name}</span>
                        <span className="shrink-0 text-sm font-semibold text-ink-950">
                          {o.price === null ? "Quoted" : formatPrice(o.price)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <ButtonLink href="/services" size="sm" variant="outline" className="mt-5 w-full">
                  See all services
                </ButtonLink>
              </div>
            </div>
          </aside>
        </div>
      </Container>

      <Section tone="dark">
        <div className="flex flex-col items-center text-center">
          <SectionHeading
            tone="dark"
            align="center"
            title="Ready to get started?"
            lead={`Book ${service.name.toLowerCase()} online, or talk to a grader first — we're happy to tell you if a book isn't worth the fee.`}
          />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact" size="lg" variant="gold">
              Talk to a grader
            </ButtonLink>
            <ButtonLink href="/store" size="lg" variant="ghostLight">
              Browse the store
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
