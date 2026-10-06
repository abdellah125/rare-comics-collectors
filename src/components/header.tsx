"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo, type Brand } from "@/components/logo";
import { useCart } from "@/components/cart-provider";
import { useAuth } from "@/components/auth-provider";
import { CartIcon, CloseIcon, MenuIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "@/components/icons";
import { useT } from "@/components/i18n-provider";
import { LanguageSelect } from "@/components/language-select";
import { splitLocale } from "@/lib/i18n/config";
import { whatsappMessage, whatsappUrl } from "@/lib/whatsapp";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { primaryNav } from "@/lib/nav";
import { mapLink, site, fullAddress } from "@/lib/site";

export function Header({ brand, shippingNotice, locales = [] }: { brand?: Brand; shippingNotice?: string; locales?: { code: string; name: string }[] }) {
  const tr = useT();
  // Under a language prefix (/fr/store) the menu still matches on the page's own path.
  const pathname = splitLocale(usePathname() ?? "/").path;
  const wa = whatsappUrl(whatsappMessage(pathname));
  const { count, openCart, hydrated } = useCart();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Close any open menu whenever the route changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setMenuOpen(false);
      setDropdownOpen(false);
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes whichever menu is open; clicking outside closes the account menu.
  useEffect(() => {
    if (!menuOpen && !dropdownOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setDropdownOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen, dropdownOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const signOut = () => {
    logout();
    setDropdownOpen(false);
    setMenuOpen(false);
  };

  return (
    <>
      {/* Utility bar — also a secondary NAP signal for local SEO */}
      <section aria-label={tr("Shipping notice and contact details")} className="hidden bg-ink-950 text-ink-300 lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-2 text-[12px]">
          <p className="flex min-w-0 items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
            {shippingNotice ?? tr("Insured shipping on every order")} · {tr("Every book authenticity-guaranteed")}
          </p>
          <div className="flex shrink-0 items-center gap-5 whitespace-nowrap pl-6">
            <a href={mapLink} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 hover:text-white 2xl:flex">
              <PinIcon className="h-3.5 w-3.5" />
              <span>{fullAddress}</span>
            </a>
            <a href={`tel:${site.phone}`} className="flex items-center gap-1.5 hover:text-white">
              <PhoneIcon className="h-3.5 w-3.5" />
              <span>{site.phoneDisplay}</span>
            </a>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-white" data-testid="header-whatsapp-bar">
              <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
              <span>WhatsApp {site.whatsapp.display}</span>
            </a>
            <LanguageSelect locales={locales} tone="dark" showLabel={false} />
          </div>
        </div>
      </section>

      <header
        className={`sticky top-0 z-50 border-b bg-white/92 backdrop-blur-md transition-shadow ${
          scrolled ? "border-ink-200 shadow-plate" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-8">
          <Logo className="min-w-0" brand={brand} />

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
                    {tr(item.label)}
                    {isActive(item.href) && (
                      <span aria-hidden className="absolute inset-x-3.5 -bottom-px h-0.5 rounded-full bg-brand-600" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Wrapped so `hidden` never competes with the button's own display utility. */}
            <div className="hidden sm:block">
              <Link href="/services/appraisal-and-valuation" className={`${buttonStyles.dark} ${buttonSizes.sm}`}>
                {tr("Free appraisal")}
              </Link>
            </div>

            {user ? (
              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white hover:bg-brand-700"
                  aria-label={tr("Account menu for {name}", { name: user.name })}
                  aria-expanded={dropdownOpen}
                  aria-controls="account-menu"
                >
                  {user.name.slice(0, 2).toUpperCase()}
                </button>
                {dropdownOpen && (
                  <div
                    id="account-menu"
                    className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-ink-200 bg-white py-1 shadow-lg"
                  >
                    <p className="truncate px-4 py-2 text-xs font-medium text-ink-500">{user.name}</p>
                    <hr className="my-1 border-ink-100" />
                    <Link href="/account" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">{tr("My account")}</Link>
                    <Link href="/account/orders" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">{tr("Orders")}</Link>
                    <Link href="/account/notifications" onClick={() => setDropdownOpen(false)} className="flex items-center justify-between px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">
                      {tr("Notifications")}
                      {user.unreadNotifications > 0 && (
                        <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{user.unreadNotifications}</span>
                      )}
                    </Link>
                    {user.isSeller ? (
                      <Link href="/dashboard" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">{tr("Seller dashboard")}</Link>
                    ) : (
                      <Link href="/account/seller" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm text-ink-800 hover:bg-ink-50">{tr("Become a seller")}</Link>
                    )}
                    {user.isAdmin && (
                      <Link href="/admin" onClick={() => setDropdownOpen(false)} className="block px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-ink-50">{tr("Admin panel")}</Link>
                    )}
                    <hr className="my-1 border-ink-100" />
                    <button type="button" onClick={signOut} className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50">{tr("Sign out")}</button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/account/login" className="hidden text-sm font-medium text-ink-700 hover:text-ink-950 sm:block">
                {tr("Sign in")}
              </Link>
            )}

            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="grid h-10 w-10 place-items-center rounded-lg text-[#128C7E] hover:bg-ink-100"
              aria-label={tr("Message us on WhatsApp")}
              title={tr("Message us on WhatsApp")}
              data-testid="header-whatsapp"
            >
              <WhatsAppIcon className="h-[22px] w-[22px]" />
            </a>

            <button
              type="button"
              onClick={openCart}
              className="relative grid h-10 w-10 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 hover:text-ink-950"
              aria-label={hydrated && count > 0 ? (count === 1 ? tr("Open cart, 1 item") : tr("Open cart, {count} items", { count })) : tr("Open cart")}
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
              aria-label={menuOpen ? tr("Close menu") : tr("Open menu")}
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
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-[15px] font-medium ${
                      isActive(item.href) ? "bg-brand-50 text-brand-800" : "text-ink-800 hover:bg-ink-100"
                    }`}
                  >
                    {tr(item.label)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid gap-2 border-t border-ink-200 pt-3 text-sm">
              <a href={`tel:${site.phone}`} className="flex items-center gap-2 px-3 py-2 text-ink-700">
                <PhoneIcon className="h-4 w-4 text-brand-600" /> {site.phoneDisplay}
              </a>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 text-ink-700">
                <WhatsAppIcon className="h-4 w-4 text-[#128C7E]" /> WhatsApp {site.whatsapp.display}
              </a>
              <a
                href={mapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-ink-700"
              >
                <PinIcon className="h-4 w-4 text-brand-600" /> {fullAddress}
              </a>
              <div className="px-3 py-1">
                <LanguageSelect locales={locales} tone="light" />
              </div>
              <div className="border-t border-ink-200 pt-2">
                {user ? (
                  <>
                    <Link href="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-ink-800 hover:bg-ink-100">
                      {tr("My account")}
                    </Link>
                    <Link href="/account/orders" className="flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-ink-800 hover:bg-ink-100">
                      {tr("Orders")}
                    </Link>
                    {user.isSeller && (
                      <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 font-medium text-ink-800 hover:bg-ink-100">
                        {tr("Seller dashboard")}
                      </Link>
                    )}
                    {user.isAdmin && (
                      <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold text-brand-700 hover:bg-ink-100">
                        {tr("Admin panel")}
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-medium text-red-600 hover:bg-red-50"
                    >
                      {tr("Sign out")}
                    </button>
                  </>
                ) : (
                  <Link href="/account/login" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold text-brand-700">
                    {tr("Sign in")}
                  </Link>
                )}
              </div>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
