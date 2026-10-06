import Link from "@/components/link";
import { Logo } from "@/components/logo";
import { MailIcon, PhoneIcon, PinIcon, ClockIcon, WhatsAppIcon } from "@/components/icons";
import { LanguageSelect } from "@/components/language-select";
import { getTranslator } from "@/lib/i18n";
import { whatsappUrl } from "@/lib/whatsapp";
import { policyPages } from "@/lib/nav";
import { services } from "@/lib/services";
import { fullAddress, mapDirectionsLink, mapLink, site } from "@/lib/site";
import { CurrencySelect } from "@/components/currency-select";

const social = [
  { name: "Facebook", href: site.social.facebook },
  { name: "Instagram", href: site.social.instagram },
  { name: "X", href: site.social.x },
  { name: "YouTube", href: site.social.youtube },
  { name: "LinkedIn", href: site.social.linkedin },
];

export async function Footer({
  currencies = [],
  currentCurrency = "USD",
  shopLinks = [],
  locales = [],
}: {
  currencies?: { code: string; name: string; symbol: string }[];
  currentCurrency?: string;
  /** Collection landing pages (indexable), rendered under "Shop". */
  shopLinks?: { name: string; href: string }[];
  locales?: { code: string; name: string }[];
}) {
  const year = new Date().getFullYear();
  const tr = await getTranslator();

  return (
    <footer className="below-fold border-t border-ink-800 bg-ink-950 text-ink-300">
      <div className="mx-auto max-w-7xl px-5 pb-32 pt-14 sm:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* Brand + NAP block */}
          <div className="lg:col-span-4">
            <Logo tone="dark" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
              {tr("{name} buys, sells and grades collectible comic books from a fully insured vault in {city}, {region}. Trading since {year}.", { name: site.name, city: site.address.city, region: site.address.regionName, year: site.founded })}
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
              <a href={whatsappUrl(`Hello ${site.name}, I have a question.`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-ink-300 hover:text-white" data-testid="footer-whatsapp">
                <WhatsAppIcon className="h-4 w-4 shrink-0 text-[#25D366]" />
                WhatsApp {site.whatsapp.display}
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
                      {tr(h.days)}: {h.time}
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
                <PinIcon className="h-3.5 w-3.5" /> {tr("Get directions")}
              </a>
              <Link
                href="/contact#visit"
                className="inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/15"
              >
                {tr("Book a vault visit")}
              </Link>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid gap-8 sm:grid-cols-3 lg:col-span-8 lg:pl-8">
            <nav aria-label={tr("Shop")}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">{tr("Shop")}</h2>
              <ul className="mt-4 grid gap-2.5 text-sm">
                <li>
                  <Link href="/store" className="text-ink-400 hover:text-white">
                    {tr("All comics")}
                  </Link>
                </li>
                {shopLinks.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-ink-400 hover:text-white">
                      {l.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/publishers" className="text-ink-400 hover:text-white">
                    {tr("By publisher")}
                  </Link>
                </li>
                <li>
                  <Link href="/characters" className="text-ink-400 hover:text-white">
                    {tr("By character")}
                  </Link>
                </li>
                <li>
                  <Link href="/cart" className="text-ink-400 hover:text-white">
                    {tr("Cart")}
                  </Link>
                </li>
              </ul>
            </nav>

            <nav aria-label={tr("Services")}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">{tr("Services")}</h2>
              <ul className="mt-4 grid gap-2.5 text-sm">
                {services.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/services/${s.slug}`} className="text-ink-400 hover:text-white">
                      {tr(s.short)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div>
              <nav aria-label={tr("Company")}>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white">{tr("Company")}</h2>
                <ul className="mt-4 grid gap-2.5 text-sm">
                  <li>
                    <Link href="/about" className="text-ink-400 hover:text-white">
                      {tr("About us")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className="text-ink-400 hover:text-white">
                      {tr("Contact")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/guides" className="text-ink-400 hover:text-white">
                      {tr("Collecting guides")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/faq" className="text-ink-400 hover:text-white">
                      {tr("FAQ")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/policies" className="text-ink-400 hover:text-white">
                      {tr("Policies")}
                    </Link>
                  </li>
                </ul>
              </nav>

              <h2 className="mt-8 text-[11px] font-bold uppercase tracking-[0.16em] text-white">{tr("Follow")}</h2>
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
        <nav aria-label={tr("Legal")} className="mt-12 border-t border-white/10 pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            {policyPages.map((p) => (
              <li key={p.slug}>
                <Link href={`/policies/${p.slug}`} className="text-ink-400 hover:text-white hover:underline">
                  {tr(p.nav)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 flex flex-col gap-3 text-[13px] text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <p>
              © {year} {site.legalName}. {tr("All rights reserved.")}
            </p>
            <CurrencySelect currencies={currencies} current={currentCurrency} />
            <LanguageSelect locales={locales} tone="dark" />
          </div>
          <p>
            {tr("Comic characters, titles and cover art are the property of their respective publishers. {name} is an independent dealer and is not affiliated with CGC or CBCS.", { name: site.name })}
          </p>
        </div>
      </div>
    </footer>
  );
}
