"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { useCart } from "@/components/cart-provider";
import { CartIcon, CloseIcon, MenuIcon, PhoneIcon, PinIcon } from "@/components/icons";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { primaryNav } from "@/lib/nav";
import { mapLink, site, fullAddress } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const { count, openCart, hydrated } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Utility bar — also a secondary NAP signal for local SEO */}
      <div className="hidden bg-ink-950 text-ink-300 lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-2 text-[12px]">
          <p className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400" />
            Free insured shipping on US orders over $250 · Every book authenticity-guaranteed
          </p>
          <div className="flex items-center gap-5">
            <a href={mapLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white">
              <PinIcon className="h-3.5 w-3.5" />
              <span>{fullAddress}</span>
            </a>
            <a href={`tel:${site.phone}`} className="flex items-center gap-1.5 hover:text-white">
              <PhoneIcon className="h-3.5 w-3.5" />
              <span>{site.phoneDisplay}</span>
            </a>
          </div>
        </div>
      </div>

      <header
        className={`sticky top-0 z-50 border-b bg-white/92 backdrop-blur-md transition-shadow ${
          scrolled ? "border-ink-200 shadow-plate" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-4 px-5 sm:px-8">
          <Logo />

          <nav aria-label="Primary" className="ml-6 hidden lg:block">
            <ul className="flex items-center gap-1">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`relative rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                      isActive(item.href) ? "text-brand-700" : "text-ink-700 hover:bg-ink-100 hover:text-ink-950"
                    }`}
                  >
                    {item.label}
                    {isActive(item.href) && (
                      <span aria-hidden className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-full bg-brand-600" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/services/appraisal-and-valuation" className={`${buttonStyles.dark} ${buttonSizes.sm} hidden sm:inline-flex`}>
              Free appraisal
            </Link>

            <button
              type="button"
              onClick={openCart}
              className="relative grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 hover:text-ink-950"
              aria-label={`Open cart${hydrated && count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
            >
              <CartIcon className="h-[21px] w-[21px]" />
              {hydrated && count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white tabular-nums">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
            >
              {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div
          id="mobile-nav"
          className={`overflow-hidden border-t border-ink-200 bg-white lg:hidden ${menuOpen ? "block" : "hidden"}`}
        >
          <nav aria-label="Mobile" className="mx-auto max-w-7xl px-5 py-3 sm:px-8">
            <ul className="grid gap-0.5">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-[15px] font-medium ${
                      isActive(item.href) ? "bg-brand-50 text-brand-800" : "text-ink-800 hover:bg-ink-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 border-t border-ink-200 pt-3 text-sm">
              <a href={`tel:${site.phone}`} className="flex items-center gap-2 px-3 py-2 text-ink-700">
                <PhoneIcon className="h-4 w-4 text-brand-600" /> {site.phoneDisplay}
              </a>
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-ink-700"
              >
                <PinIcon className="h-4 w-4 text-brand-600" /> {fullAddress}
              </a>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
