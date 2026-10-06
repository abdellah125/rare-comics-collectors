import Script from "next/script";
import { site } from "@/lib/site";

/**
 * Google tag (gtag.js) for Google Analytics / Google Ads / Merchant Center.
 *
 * The tag's command queue (consent defaults, `js`, `config`) is set up right after
 * hydration, so nothing that happens on the page is lost. The library itself (about
 * 150 KB for each tag id) is fetched two seconds after the visitor's first interaction
 * (pointer, key, touch or scroll), when the main thread is next idle, or, failing that,
 * once it is idle at least three and a half seconds after the load event, whichever
 * comes first: measured on a simulated mid-range phone it blocked the main thread for
 * 0.8–1.2 s per id and competed with fonts and covers for bandwidth when loaded during
 * startup, and fetched in the instant of the first tap it delayed the answer to that tap. Pages that need
 * the tag immediately (the order confirmation with its purchase event) dispatch
 * `rcc:load-google-tag`. NEXT_PUBLIC_GOOGLE_TAG_EAGER=true restores loading on
 * startup. Only the production deployment renders it; NEXT_PUBLIC_GOOGLE_TAG_ID
 * overrides the default id (public by nature — it is in every page source).
 *
 * The Google Ads tag (AW-…, NEXT_PUBLIC_GOOGLE_ADS_TAG_ID overrides it) is a second
 * `config` on the same queue: one copy of the library serves both ids.
 *
 * Consent Mode v2: visitors in the EEA, UK and Switzerland start with storage
 * denied (cookieless pings until `gtag('consent', 'update', …)` grants it);
 * everywhere else analytics storage is on. Defaults must precede `config`.
 */
const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
];

export const GOOGLE_TAG_LOAD_EVENT = "rcc:load-google-tag";

export function GoogleTag() {
  const id = (process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || site.googleTagId).trim();
  const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
  if (!id || !isProduction) return null;
  const adsId = (process.env.NEXT_PUBLIC_GOOGLE_ADS_TAG_ID || site.googleAdsTagId).trim();
  const ids = [id, ...(adsId && adsId !== id ? [adsId] : [])];
  const libraryUrl = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  const eager = process.env.NEXT_PUBLIC_GOOGLE_TAG_EAGER === "true";
  return (
    <Script id="google-tag-init" strategy="afterInteractive">
      {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', region: ${JSON.stringify(CONSENT_REGIONS)}});
gtag('consent', 'default', {ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted'});
gtag('js', new Date());
${ids.map((tag) => `gtag('config', ${JSON.stringify(tag)});`).join(" ")}
(function(){
  var loaded = false;
  function load(){ if (loaded) return; loaded = true; var s = document.createElement('script'); s.async = true; s.src = ${JSON.stringify(libraryUrl)}; document.head.appendChild(s); }
  ${eager ? "load(); return;" : ""}
  function whenIdle(ms){ setTimeout(function(){ if ('requestIdleCallback' in window) requestIdleCallback(load, {timeout: 2000}); else load(); }, ms); }
  var asked = false;
  function interacted(){ if (asked) return; asked = true; whenIdle(2000); }
  var events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  events.forEach(function(e){ addEventListener(e, interacted, {passive: true, once: true}); });
  addEventListener(${JSON.stringify(GOOGLE_TAG_LOAD_EVENT)}, load);
  function afterLoad(){ whenIdle(3500); }
  if (document.readyState === 'complete') afterLoad(); else addEventListener('load', afterLoad);
})();`}
    </Script>
  );
}
