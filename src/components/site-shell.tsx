import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { CartProvider } from "@/components/cart-provider";
import { CartDrawer } from "@/components/cart-drawer";
import { CurrencyProvider } from "@/components/currency-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { GoogleTag } from "@/components/google-tag";
import { JsonLd } from "@/components/json-ld";
import { WelcomeOffer } from "@/components/welcome-offer";
import { ChatWidget } from "@/components/chat-widget";
import { I18nProvider } from "@/components/i18n-provider";
import { getDictionary, getEnabledLocales, getLocale } from "@/lib/i18n";
import { INTL_LOCALE, isLocale } from "@/lib/i18n/config";
import { makeTranslator } from "@/lib/i18n/translate";
import { db } from "@/lib/db";
import { getPresentmentCurrency, getEnabledCurrencies } from "@/lib/currency";
import { organizationJsonLd } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { listCollections } from "@/lib/catalog/collections";
import { sessionDto } from "@/lib/auth/session-dto";
import { formatMoney } from "@/lib/money";

/**
 * Storefront chrome: providers, header, main landmark, footer and the cart
 * drawer. Used by the (site) route group layout and the global 404 page.
 */
export async function SiteShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  const [currency, currencies, settings, collections, sessionUser, locale, enabledLocales] = await Promise.all([getPresentmentCurrency(), getEnabledCurrencies(), getSettings(), listCollections().catch(() => []), sessionDto(), getLocale(), getEnabledLocales()]);
  const dict = await getDictionary(locale);
  const tr = makeTranslator(dict);
  const intlLocale = isLocale(locale) ? INTL_LOCALE[locale] : "en-US";
  const locales = enabledLocales.map((l) => ({ code: l.code, name: l.name }));
  // The welcome code is for first orders: a signed-in buyer with a paid order is never shown the offer.
  const returningCustomer = sessionUser ? (await db.order.count({ where: { userId: sessionUser.id, paymentStatus: { in: ["paid", "partially_refunded", "refunded"] } } }).catch(() => 0)) > 0 : false;
  const brand = { name: settings["marketplace.name"], logoUrl: settings["marketplace.logoMediaId"] ? `/api/media/${settings["marketplace.logoMediaId"]}` : null };
  const threshold = settings["commerce.freeShippingThreshold"];
  const shippingNotice = threshold > 0 ? tr("Free insured shipping on {country} orders over {amount}", { country: settings["marketplace.defaultCountry"], amount: formatMoney(threshold, "USD", "en-US", { compact: true }) }) : tr("Insured shipping on every order");
  return (
    <>
      <JsonLd id="org-schema" data={organizationJsonLd()} />
      <GoogleTag />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        {tr("Skip to main content")}
      </a>
      <I18nProvider locale={locale} dict={dict}>
      <CurrencyProvider locale={intlLocale} currency={{ code: currency.code, symbol: currency.symbol, decimals: currency.decimals, rateToBase: currency.rateToBase, isBase: currency.isBase }}>
        <AuthProvider initialUser={sessionUser}>
          <CartProvider>
            {banner}
            <Header brand={brand} shippingNotice={shippingNotice} locales={locales} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer
              currencies={currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))}
              currentCurrency={currency.code}
              locales={locales}
              shopLinks={collections.map((c) => ({ name: c.shortName, href: `/collections/${c.slug}` }))}
            />
            <CartDrawer />
            <WelcomeOffer returningCustomer={returningCustomer} />
            <ChatWidget />
          </CartProvider>
        </AuthProvider>
      </CurrencyProvider>
      </I18nProvider>
    </>
  );
}
