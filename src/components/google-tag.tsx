import Script from "next/script";
import { site } from "@/lib/site";

/**
 * Google tag (gtag.js) for Google Analytics / Google Ads. Loaded once the page has
 * finished loading (`lazyOnload`): the 150 KB library used to block the main thread
 * for ~0.8 s during startup and compete with fonts and covers for bandwidth, which
 * pushed LCP out by seconds on mobile. Page views still fire on every visit. Only on the
 * production deployment so previews and local runs do not pollute the reports.
 * The tag id is public by nature (it is in the page source of every site that
 * uses one); NEXT_PUBLIC_GOOGLE_TAG_ID overrides the default in src/lib/site.ts.
 *
 * Consent Mode v2: visitors in the EEA, UK and Switzerland start with storage
 * denied, so the tag sends cookieless pings there until `gtag('consent', 'update', …)`
 * grants it; everywhere else analytics storage is on. The default must be queued
 * before `config`, which is why both live in the same inline snippet.
 */
const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
];

export function GoogleTag() {
  const id = (process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || site.googleTagId).trim();
  const isProduction = process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview";
  if (!id || !isProduction) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="lazyOnload" />
      <Script id="google-tag-init" strategy="lazyOnload">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', region: ${JSON.stringify(CONSENT_REGIONS)}});
gtag('consent', 'default', {ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted'});
gtag('js', new Date());
gtag('config', ${JSON.stringify(id)});`}
      </Script>
    </>
  );
}
