"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";

/** Staff and seller back-office pages: their load times are not what shoppers experience. */
const BACK_OFFICE = /^\/(admin|dashboard)(\/|$)/;

/**
 * Vercel Speed Insights (real-visitor Core Web Vitals; it only reports from a Vercel deployment).
 * Measurements from the back office are dropped so the scores describe the storefront.
 */
export function SpeedInsightsTag() {
  return (
    <SpeedInsights
      beforeSend={(event) => {
        try {
          if (BACK_OFFICE.test(new URL(event.url, window.location.origin).pathname)) return null;
        } catch {
          // an address that cannot be read is reported as it is
        }
        return event;
      }}
    />
  );
}
