import Link from "next/link";
import type { Metadata } from "next";

import { CoverArt } from "@/components/cover-art";
import { ProductCard } from "@/components/product-card";
import { Badge, ButtonLink, Eyebrow, Section, SectionHeading, Stars } from "@/components/ui";
import { serviceIcons, CheckIcon, PinIcon, ShieldIcon } from "@/components/icons";
import { CollectionCards, PublisherChips } from "@/components/catalog-links";
import { JsonLd } from "@/components/json-ld";
import { listCollections, listPublishers } from "@/lib/catalog/collections";
import { countPublished, homeProducts } from "@/lib/catalog/products";
import { services } from "@/lib/services";
import { formatPrice } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { fullAddress, mapDirectionsLink, mapEmbedLink, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  // The root layout template appends "| <site name>"; keep it out of the page title itself.
  title: "Buy Graded Comics & Professional Comic Grading",
  description: `Shop CGC and CBCS graded key issues with an authenticity guarantee, then use ${site.name} for grading submission, pressing, restoration detection and appraisal. Insured shipping nationwide from ${site.address.city}, ${site.address.region}.`,
  path: "/",
  keywords: [
    "buy graded comics online",
    "CGC comics for sale",
    "comic book grading service",
    "comic pressing",
    "comic appraisal",
    `comic shop ${site.address.city} ${site.address.region}`,
  ],
});

const trustPointsFor = (freeShippingThreshold: number, returnWindowDays: number) => [
  {
    title: "Authenticity guaranteed",
    body: "Every book is restoration-checked and cert-verified before it is listed. Undisclosed restoration is refunded in full, forever.",
  },
  {
    title: "Insured, tracked shipping",
    body: `Double-boxed, signature-required and insured to full value on every order.${freeShippingThreshold > 0 ? ` Free over ${formatMoney(freeShippingThreshold, "USD", "en-US", { compact: true })} within the US.` : ""}`,
  },
  {
    title: `${returnWindowDays}-day inspection window`,
    body: `Buy with confidence. Return any book within ${returnWindowDays} days in its original holder for a full refund.`,
  },
  {
    title: "Real market pricing",
    body: "We price against realised sales, not guide values, and publish the comparables that back every listing.",
  },
];

const steps = [
  { n: "01", title: "Request a kit", body: "Tell us what you're sending. We ship archival supplies and a rigid shipper at no charge." },
  { n: "02", title: "We pre-screen", body: `A ${site.name} grader estimates the grade, flags press candidates and checks for restoration.` },
  { n: "03", title: "You approve", body: "Per-book recommendations with tier costs and expected value. Nothing is submitted without your sign-off." },
  { n: "04", title: "Slab, sell or store", body: "Take your slabs back, list them on consignment, or leave them in the insured vault." },
];

const reviews = [
  {
    quote:
      "They talked me out of submitting four of the eight books I sent — said the tier fees wouldn't pay for themselves. Nobody does that. The four they did submit all came back at or above their estimate.",
    name: "Daniel R.",
    role: "Collector, Houston TX",
  },
  {
    quote:
      `I inherited a 6,000-book collection and had no idea what to do with it. ${site.name} appraised it, consigned the top 200 and handled the rest. The insurance schedule alone was worth the fee.`,
    name: "Priya M.",
    role: "Estate executor, Dallas TX",
  },
  {
    quote:
      "Bought a five-figure Silver Age key sight-unseen. It arrived double-boxed with a condition report and photos of the slab from six angles. Exactly as described.",
    name: "Marcus T.",
    role: "Investor, Chicago IL",
  },
];

export default async function HomePage() {
  const [{ hero, grid }, inventoryCount, settings, collections, publishers] = await Promise.all([homeProducts(), countPublished(), getSettings(), listCollections(), listPublishers()]);
  const trustPoints = trustPointsFor(settings["commerce.freeShippingThreshold"], settings["commerce.returnWindowDays"]);
  const headline = settings["marketplace.homepageHeadline"].trim();
  const subheadline = settings["marketplace.homepageSubheadline"].trim();

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Featured graded comics",
    numberOfItems: grid.length,
    itemListElement: grid.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site.url}/store/${p.slug}`,
      name: `${p.title} ${p.issue} — ${p.grader} ${p.grade}`,
    })),
  };

  const homeFaqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Do you sell CGC and CBCS graded comics?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Every slabbed book in our store is a genuine CGC or CBCS holder with a verifiable certification number, and we also sell honestly graded raw books with full defect disclosure.",
        },
      },
      {
        "@type": "Question",
        name: "Can you grade my comics for me?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "We are an authorised submission centre for CGC and CBCS. We pre-screen, press where it helps, select the tier and declared value, and handle insured shipping both ways at dealer rates.",
        },
      },
      {
        "@type": "Question",
        name: "Where are you located?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Our vault and showroom are at ${fullAddress}. Walk-ins are welcome during business hours and vault viewings are by appointment.`,
        },
      },
    ],
  };

  return (
    <>
      <JsonLd id="home-itemlist" data={itemListJsonLd} />
      <JsonLd id="home-faq" data={homeFaqJsonLd} />

      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(60% 55% at 15% 10%, rgba(244,63,94,.42), transparent 60%), radial-gradient(55% 50% at 90% 85%, rgba(245,158,11,.28), transparent 62%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-24">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-400/35 bg-brand-500/12 px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand-300">
              <ShieldIcon className="h-3.5 w-3.5" />
              Authorised CGC &amp; CBCS submission centre
            </span>

            <h1 className="mt-6 font-display text-[clamp(2.4rem,5.4vw,4rem)] font-semibold leading-[1.04] tracking-tight">
              {headline || (
                <>
                  Buy graded comics.
                  <br />
                  <span className="text-brand-400">Grade yours.</span> Know what it&apos;s worth.
                </>
              )}
            </h1>

            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-300">
              {subheadline ||
                "A vetted inventory of CGC and CBCS key issues, plus the grading, pressing, appraisal and consignment services that turn a shelf of long boxes into a documented, insurable collection."}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/store" size="lg" variant="primary">
                Shop the store
              </ButtonLink>
              <ButtonLink href="/services" size="lg" variant="ghostLight">
                Explore our services
              </ButtonLink>
            </div>

            <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
              {site.stats.map((s) => (
                <div key={s.label}>
                  <dt className="sr-only">{s.label}</dt>
                  <dd>
                    <span className="block font-display text-2xl font-semibold text-white sm:text-[28px]">
                      {s.value}
                    </span>
                    <span className="mt-1 block text-[12px] leading-snug text-ink-400">{s.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Fanned covers */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto flex max-w-md items-end justify-center gap-3 sm:gap-4">
              {hero.map((p, i) => (
                // The fan rotation lives on a wrapper so the hover lift on the link isn't overridden by it.
                <div
                  key={p.slug}
                  className="relative flex-1"
                  style={{
                    transform: `rotate(${(i - 1) * 5}deg) translateY(${i === 1 ? -22 : 0}px)`,
                    zIndex: i === 1 ? 3 : 1,
                  }}
                >
                  <Link
                    href={`/store/${p.slug}`}
                    className="block rounded-md transition-transform duration-300 hover:-translate-y-2 focus-visible:-translate-y-2"
                  >
                    <CoverArt
                      product={p}
                      priority={i === 1}
                      sizes="(max-width: 640px) 30vw, 150px"
                      className="aspect-[2/3] w-full shadow-[0_24px_60px_-18px_rgba(0,0,0,.85)] ring-1 ring-white/15"
                    />
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-9 text-center text-[13px] text-ink-400">
              Featured in the vault this week ·{" "}
              <Link href="/store" className="font-medium text-brand-300 underline-offset-4 hover:underline">
                see all {inventoryCount.toLocaleString("en-US")} listings
              </Link>
            </p>
          </div>
        </div>

        {/* trust strip */}
        <div className="relative border-t border-white/10">
          <ul className="mx-auto grid max-w-7xl gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {trustPoints.map((t) => (
              <li key={t.title} className="bg-ink-950 px-5 py-6 sm:px-8">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <CheckIcon className="h-4 w-4 shrink-0 text-brand-400" />
                  {t.title}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-400">{t.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------ storefront */}
      <Section tone="white" id="featured">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            eyebrow="The store"
            title="Graded keys, ready to ship"
            lead="Every listing is cert-verified, restoration-checked and photographed in the holder. Buy now for immediate checkout, or add to your cart and keep browsing."
          />
          <ButtonLink href="/store" variant="outline" size="md">
            View all inventory
          </ButtonLink>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {grid.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-ink-500">
          Looking for something specific?{" "}
          <Link href="/contact" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            Send us a want list
          </Link>{" "}
          — we source books privately for clients every week.
        </p>

        <div className="mt-14 grid gap-10">
          <CollectionCards collections={collections} />
          <PublisherChips publishers={publishers.slice(0, 12)} />
        </div>
      </Section>

      {/* -------------------------------------------------------- services */}
      <Section tone="muted" id="services">
        <SectionHeading
          eyebrow="Collector services"
          title="Everything that happens after you own the book"
          lead="Grading, pressing, authentication, appraisal, consignment and storage — run in-house by graders who have handled six-figure books."
          align="center"
        />

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const Icon = serviceIcons[s.icon];
            return (
              <article
                key={s.slug}
                className="group relative flex flex-col rounded-xl border border-ink-200 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-ink-950">
                  <Link href={`/services/${s.slug}`}>
                    <span className="absolute inset-0" aria-hidden />
                    {s.name}
                  </Link>
                </h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-600">{s.summary}</p>
                <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
                  <span className="text-sm font-semibold text-ink-950">
                    {s.price === null ? "Quoted" : formatPrice(s.price)}
                    <span className="ml-1.5 text-xs font-normal text-ink-500">{s.priceNote}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-brand-700 group-hover:underline">Details →</span>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      {/* ----------------------------------------------------------- steps */}
      <Section tone="dark">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHeading
              tone="dark"
              eyebrow="How grading works"
              title="Four steps from long box to slab"
              lead="Most collectors lose money on grading before the book is even opened — wrong tier, wrong declared value, or damage in transit. We take that risk off your desk."
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/services/grading-submission" variant="primary" size="md">
                Start a submission
              </ButtonLink>
              <ButtonLink href="/faq" variant="ghostLight" size="md">
                Read the FAQ
              </ButtonLink>
            </div>
          </div>

          <ol className="grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-2 lg:col-span-7">
            {steps.map((s) => (
              <li key={s.n} className="bg-ink-950 p-6">
                <span className="font-display text-sm font-bold text-brand-400">{s.n}</span>
                <h3 className="mt-2 font-display text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* -------------------------------------------------------- location */}
      <Section tone="white" id="visit">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
          <div>
            <SectionHeading
              eyebrow="Visit the vault"
              title={`Comic grading & collectible sales in ${site.address.city}, ${site.address.regionName}`}
              lead="Bring books in for a free counter appraisal, inspect a high-value slab in person before you buy, or drop off a submission and skip the shipping entirely."
            />

            <dl className="mt-8 grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Address</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-800">
                  {site.address.street}
                  <br />
                  {site.address.city}, {site.address.region} {site.address.postalCode}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Opening hours</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-800">
                  {site.hours.map((h) => (
                    <span key={h.days} className="block">
                      <span className="text-ink-500">{h.days}</span> · {h.time}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={mapDirectionsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-plate transition-colors hover:bg-brand-700"
              >
                <PinIcon className="h-4 w-4" />
                Get directions
              </a>
              <ButtonLink href="/contact" variant="outline" size="md">
                Book an appointment
              </ButtonLink>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-ink-200 shadow-plate">
            <iframe
              title={`Map showing ${site.name} at ${fullAddress}`}
              src={mapEmbedLink}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[380px] w-full border-0"
            />
            <div className="flex items-center justify-between gap-4 border-t border-ink-200 bg-ink-50 px-5 py-3.5">
              <p className="text-[13px] text-ink-700">
                <span className="font-semibold text-ink-950">{site.name}</span> · {fullAddress}
              </p>
              <a
                href={mapDirectionsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[13px] font-semibold text-brand-700 underline-offset-4 hover:underline"
              >
                Open in Maps →
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------------- reviews */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="What collectors say"
          title="Trusted with collections from one book to forty thousand"
          align="center"
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {reviews.map((r) => (
            <figure key={r.name} className="flex flex-col rounded-xl border border-ink-200 bg-white p-6">
              <Stars rating={5} />
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-ink-700">
                &ldquo;{r.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 border-t border-ink-100 pt-4 text-sm">
                <span className="font-semibold text-ink-950">{r.name}</span>
                <span className="mt-0.5 block text-[13px] text-ink-500">{r.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------- cta */}
      <section className="bg-ink-950">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-brand-800 via-ink-900 to-ink-950 px-6 py-12 text-center sm:px-14 lg:py-16">
            <Eyebrow tone="dark">Free, no-obligation</Eyebrow>
            <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Find out what your collection is actually worth
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-300">
              Send photos or a cert list and we&apos;ll return a written market estimate within two business days —
              whether you sell to us, consign, or keep it all.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/contact" size="lg" variant="gold">
                Request a free appraisal
              </ButtonLink>
              <ButtonLink href="/services/consignment-and-brokerage" size="lg" variant="ghostLight">
                See consignment rates
              </ButtonLink>
            </div>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] text-ink-400">
              <Badge tone="brand">From {formatPrice(services[0].price ?? 0)} per book</Badge>
              <span>No minimum collection size</span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
