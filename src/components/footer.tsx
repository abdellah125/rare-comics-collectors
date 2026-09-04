import Link from "next/link";
import { Logo } from "@/components/logo";
import { MailIcon, PhoneIcon, PinIcon, ClockIcon } from "@/components/icons";
import { policyPages } from "@/lib/nav";
import { services } from "@/lib/services";
import { eras } from "@/lib/products";
import { fullAddress, mapDirectionsLink, mapLink, site } from "@/lib/site";
import { CurrencySelect } from "@/components/currency-select";

const social = [
  { name: "Facebook", href: site.social.facebook },
  { name: "Instagram", href: site.social.instagram },
  { name: "X", href: site.social.x },
  { name: "YouTube", href: site.social.youtube },
  { name: "LinkedIn", href: site.social.linkedin },
];

export function Footer({
  currencies = [],
  currentCurrency = "USD",
}: {
  currencies?: { code: string; name: string; symbol: string }[];
  currentCurrency?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-ink-800 bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Brand + NAP block */}
          <div className="lg:col-span-4">
            <Logo tone="dark" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
              {site.name} buys, sells and grades collectible comic books from a fully insured vault in{" "}
              {site.address.city}, {site.address.regionName}. Trading since {site.founded}.
            </p>

            <address className="mt-6 grid gap-2.5 not-italic text-sm">
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 text-ink-300 hover:text-white"
              >
                <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>{fullAddress}</span>
              </a>
              <a href={`tel:${site.phone}`} className="flex items-center gap-2.5 text-ink-300 hover:text-white">
                <PhoneIcon className="h-4 w-4 shrink-0 text-brand-400" />
                {site.phoneDisplay}
              </a>
              <a href={`mailto:${site.email}`} className="flex items-center gap-2.5 text-ink-300 hover:text-white">
                <MailIcon className="h-4 w-4 shrink-0 text-brand-400" />
                {site.email}
              </a>
              <p className="flex items-start gap-2.5 text-ink-400">
                <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>
                  {site.hours.map((h) => (
                    <span key={h.days} className="block">
                      {h.days}: {h.time}
                    </span>
                  ))}
                </span>
              </p>
            </address>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={mapDirectionsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/15"
              >
                <PinIcon className="h-3.5 w-3.5" /> Get directions
              </a>
              <Link
                href="/contact#visit"
                className="inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/15"
              >
                Book a vault visit
              </Link>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid gap-8 sm:grid-cols-3 lg:col-span-8 lg:pl-8">
            <nav aria-label="Shop">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">Shop</h2>
              <ul className="mt-4 grid gap-2.5 text-sm">
                <li>
                  <Link href="/store" className="text-ink-400 hover:text-white">
                    All comics
                  </Link>
                </li>
                {eras.map((era) => (
                  <li key={era}>
                    <Link
                      href={`/store?era=${encodeURIComponent(era)}`}
                      className="text-ink-400 hover:text-white"
                    >
                      {era}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/cart" className="text-ink-400 hover:text-white">
                    Cart
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label="Services">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">Services</h2>
              <ul className="mt-4 grid gap-2.5 text-sm">
                {services.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/services/${s.slug}`} className="text-ink-400 hover:text-white">
                      {s.short}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div>
              <nav aria-label="Company">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">Company</h2>
                <ul className="mt-4 grid gap-2.5 text-sm">
                  <li>
                    <Link href="/about" className="text-ink-400 hover:text-white">
                      About us
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="text-ink-400 hover:text-white">
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link href="/faq" className="text-ink-400 hover:text-white">
                      FAQ
                    </Link>
                  </li>
                  <li>
                    <Link href="/policies" className="text-ink-400 hover:text-white">
                      Policies
                    </Link>
                  </li>
                </ul>
              </nav>

              <h2 className="mt-8 text-[11px] font-bold uppercase tracking-[0.16em] text-white">Follow</h2>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {social.map((s) => (
                  <li key={s.name}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="text-ink-400 hover:text-white"
                    >
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Policy strip */}
        <nav aria-label="Legal" className="mt-12 border-t border-white/10 pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            {policyPages.map((p) => (
              <li key={p.slug}>
                <Link href={`/policies/${p.slug}`} className="text-ink-400 hover:text-white hover:underline">
                  {p.nav}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 flex flex-col gap-3 text-[13px] text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <p>
              © {year} {site.legalName}. All rights reserved.
            </p>
            <CurrencySelect currencies={currencies} current={currentCurrency} />
          </div>
          <p>
            Comic characters, titles and cover art are the property of their respective publishers. {site.name} is an
            independent dealer and is not affiliated with CGC or CBCS.
          </p>
        </div>
      </div>
    </footer>
  );
}
