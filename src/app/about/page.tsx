import type { Metadata } from "next";

import { Breadcrumbs, ButtonLink, Container, Section, SectionHeading, type Crumb } from "@/components/ui";
import { CheckIcon } from "@/components/icons";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";
import { fullAddress, site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `About ${site.name} — Comic Dealers & Graders Since ${site.founded}`,
  description: `${site.name} has bought, sold and graded collectible comics from ${site.address.city}, ${site.address.regionName} since ${site.founded}. Meet the graders, see how we price, and read the standards we hold ourselves to.`,
  path: "/about",
  keywords: ["comic book dealer", "professional comic graders", `${site.address.city} comic store`, `about ${site.name}`],
});

const crumbs: Crumb[] = [
  { name: "Home", href: "/" },
  { name: "About", href: "/about" },
];

const team = [
  {
    name: "Ellis Vance",
    role: "Founder & Principal Grader",
    bio: "Twenty-two years in the hobby, eleven of them grading professionally. Has personally handled more than 40,000 books, including four seven-figure Golden Age keys.",
    initials: "EV",
  },
  {
    name: "Noor Haddad",
    role: "Head of Restoration Detection",
    bio: "Former paper conservator. Built our UV and dimensional analysis protocol, which has caught undisclosed restoration on 312 books submitted to us since 2019.",
    initials: "NH",
  },
  {
    name: "Theo Barros",
    role: "Master Presser",
    bio: "Fifteen years pressing, on everything from 2024 variants to 1939 newsprint. Runs a calibrated humidity-controlled system and refuses roughly one book in six as unsafe.",
    initials: "TB",
  },
  {
    name: "Simone Achebe",
    role: "Director of Appraisal & Consignment",
    bio: "Appraises for insurers, probate courts and private clients. Has valued estates ranging from a single slab to 43,000 issues.",
    initials: "SA",
  },
];

const standards = [
  "We publish the comparable sales behind every price. If you disagree, tell us which comp you're using.",
  "We disclose every defect we can see on raw books, and photograph them, before you buy.",
  "We tell you when grading isn't worth the fee — even though the fee is our revenue.",
  "We never condition an appraisal on a sale, and we disclose in writing when we might buy what we're valuing.",
  "We hold stored and consigned books as bailment, not as company assets.",
  "We honour the authenticity guarantee with no time limit. Undisclosed restoration is refunded in full, forever.",
];

const timeline = [
  { year: "2011", title: "A card table at a con", body: "Ellis started with two long boxes and a folding table at a Central Texas convention." },
  { year: "2014", title: "First storefront", body: "A 600 sq ft shop off South Lamar. Grading submission started as a favour for regulars." },
  { year: "2017", title: "Authorised submission centre", body: "Approved for dealer-rate submission with CGC, and with CBCS the following year." },
  { year: "2019", title: "Detection lab", body: "Noor joined and built the UV and dimensional analysis protocol we still use." },
  { year: "2022", title: "The vault", body: "Moved to Congress Avenue with a climate-controlled, fire-suppressed vault and a $60M policy." },
  { year: "2026", title: "200,000 books later", body: "Still the same standard: tell the client the truth, even when it costs us the sale." },
];

export default function AboutPage() {
  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${site.name}`,
    url: `${site.url}/about`,
    mainEntity: { "@id": `${site.url}/#organization` },
    isPartOf: { "@id": `${site.url}/#website` },
  };

  return (
    <>
      <JsonLd id="about-breadcrumbs" data={breadcrumbJsonLd(crumbs)} />
      <JsonLd id="about-schema" data={aboutJsonLd} />

      <section className="border-b border-ink-200 bg-ink-50">
        <Container className="py-12 lg:py-16">
          <Breadcrumbs items={crumbs} />
          <div className="mt-6 max-w-3xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">
              Trading since {site.founded}
            </p>
            <h1 className="mt-3 font-display text-[clamp(2.1rem,4.6vw,3.4rem)] font-semibold leading-[1.08] text-ink-950">
              We&apos;d rather lose the sale than lose your trust
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-700">
              {site.name} is an independent comic dealer and authorised CGC and CBCS submission centre operating from{" "}
              {site.address.city}, {site.address.regionName}. We buy, sell, grade, press, appraise and store
              collectible comics — and we tell clients when the answer is &ldquo;don&apos;t.&rdquo;
            </p>
          </div>

          <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {site.stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-ink-200 bg-white p-5">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block font-display text-2xl font-semibold text-ink-950">{s.value}</span>
                  <span className="mt-1 block text-[12px] leading-snug text-ink-500">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="py-14 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold text-ink-950">Why we exist</h2>
            <div className="prose-doc mt-4">
              <p>
                The collectibles market runs on information asymmetry. The dealer knows what a book is worth; the
                seller usually doesn&apos;t. That gap is where most of the industry makes its margin, and it is why so
                many people who inherit a collection end up taking a fraction of its value.
              </p>
              <p>
                We built {site.name} on the opposite bet: that if you tell people the truth about what they have —
                including when it isn&apos;t worth much, and including when grading it would cost more than it adds —
                they come back, and they send their friends. Fifteen years in, that bet has held.
              </p>
              <p>
                Concretely, it means roughly one in three books we pre-screen for grading goes back to the owner
                ungraded, with an explanation. It means we publish the comparable sales behind our asking prices. And
                it means our appraisals carry a written conflict disclosure whenever we might also want to buy.
              </p>
            </div>

            <h2 className="mt-12 font-display text-2xl font-semibold text-ink-950">Our standards</h2>
            <ul className="mt-5 grid gap-3">
              {standards.map((s) => (
                <li key={s} className="flex items-start gap-3 text-[15px] leading-relaxed text-ink-700">
                  <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-brand-600" />
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <aside className="lg:col-span-5">
            <h2 className="font-display text-2xl font-semibold text-ink-950">How we got here</h2>
            <ol className="mt-6 border-l border-ink-200">
              {timeline.map((t) => (
                <li key={t.year} className="relative pb-8 pl-6 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-4 ring-white"
                  />
                  <p className="font-display text-sm font-bold text-brand-700">{t.year}</p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-ink-950">{t.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-600">{t.body}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </Container>

      <Section tone="muted">
        <SectionHeading
          eyebrow="The people"
          title="Who actually handles your books"
          lead="Four full-time specialists, all in-house. Nothing is brokered out to a third party you never meet."
          align="center"
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {team.map((m) => (
            <article key={m.name} className="flex gap-5 rounded-xl border border-ink-200 bg-white p-6">
              <span
                aria-hidden
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ink-950 font-display text-lg font-semibold text-white"
              >
                {m.initials}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink-950">{m.name}</h3>
                <p className="text-[13px] font-semibold uppercase tracking-wide text-brand-700">{m.role}</p>
                <p className="mt-2.5 text-[14px] leading-relaxed text-ink-600">{m.bio}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section tone="dark">
        <div className="flex flex-col items-center text-center">
          <SectionHeading
            tone="dark"
            align="center"
            title="Come see the vault"
            lead={`We're at ${fullAddress}. Walk in during business hours for a free counter appraisal, or book an appointment to inspect a high-value slab in person.`}
          />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/contact" size="lg" variant="gold">
              Get in touch
            </ButtonLink>
            <ButtonLink href="/store" size="lg" variant="ghostLight">
              Browse inventory
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
