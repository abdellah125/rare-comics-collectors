import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { CartProvider } from "@/components/cart-provider";
import { CartDrawer } from "@/components/cart-drawer";
import { CurrencyProvider } from "@/components/currency-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { JsonLd } from "@/components/json-ld";
import { getPresentmentCurrency, getEnabledCurrencies } from "@/lib/currency";
import { organizationJsonLd } from "@/lib/seo";
import { getSettings } from "@/lib/settings";

/**
 * Storefront chrome: providers, header, main landmark, footer and the cart
 * drawer. Used by the (site) route group layout and the global 404 page.
 */
export async function SiteShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  const [currency, currencies, settings] = await Promise.all([getPresentmentCurrency(), getEnabledCurrencies(), getSettings()]);
  const brand = { name: settings["marketplace.name"], logoUrl: settings["marketplace.logoMediaId"] ? `/api/media/${settings["marketplace.logoMediaId"]}` : null };
  return (
    <>
      <JsonLd id="org-schema" data={organizationJsonLd()} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <CurrencyProvider currency={{ code: currency.code, symbol: currency.symbol, decimals: currency.decimals, rateToBase: currency.rateToBase, isBase: currency.isBase }}>
        <AuthProvider>
          <CartProvider>
            {banner}
            <Header brand={brand} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer currencies={currencies.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol }))} currentCurrency={currency.code} />
            <CartDrawer />
          </CartProvider>
        </AuthProvider>
      </CurrencyProvider>
    </>
  );
}
