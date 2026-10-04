import { describe, expect, it } from "vitest";
import { businessStatus, clock } from "@/lib/business-hours";
import { acceptedLanguages, canPrefix, countryFromHeaders, currencyForCountry, detectLocale, isCrawler, localizePath, splitLocale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";
import { makeTranslator, translate } from "@/lib/i18n/translate";
import { whatsappMessage, whatsappUrl } from "@/lib/whatsapp";
import { extractStrings } from "../../scripts/i18n-extract.mjs";

const ENABLED = ["en", "es", "fr", "de"];

describe("language URLs", () => {
  it("splits and builds prefixed paths, leaving English plain", () => {
    expect(splitLocale("/fr/store")).toEqual({ locale: "fr", path: "/store" });
    expect(splitLocale("/fr")).toEqual({ locale: "fr", path: "/" });
    expect(splitLocale("/store")).toEqual({ locale: null, path: "/store" });
    expect(splitLocale("/en/store")).toEqual({ locale: null, path: "/en/store" });
    expect(splitLocale("/frames")).toEqual({ locale: null, path: "/frames" });
    expect(localizePath("/store", "de")).toBe("/de/store");
    expect(localizePath("/", "es")).toBe("/es");
    expect(localizePath("/fr/contact", "en")).toBe("/contact");
    expect(localizePath("/fr/contact", "de")).toBe("/de/contact");
  });

  it("never prefixes private or transactional sections", () => {
    for (const p of ["/admin", "/admin/orders", "/account/orders", "/checkout", "/api/jobs/run", "/dashboard"]) {
      expect(canPrefix(p)).toBe(false);
      expect(localizePath(p, "fr")).toBe(p);
    }
    expect(canPrefix("/accounting-guide")).toBe(true);
  });
});

describe("detection by country", () => {
  it("picks the country's language, and lets the browser choose only between that country's languages", () => {
    expect(detectLocale("FR", "en-US,en;q=0.9", ENABLED)).toBe("fr");
    expect(detectLocale("MX", null, ENABLED)).toBe("es");
    expect(detectLocale("DE", "tr", ENABLED)).toBe("de");
    expect(detectLocale("CH", "fr-CH,fr;q=0.9,de;q=0.8", ENABLED)).toBe("fr");
    expect(detectLocale("CH", "it", ENABLED)).toBe("de");
    expect(detectLocale("CA", "fr-CA", ENABLED)).toBe("fr");
    expect(detectLocale("CA", "en-CA", ENABLED)).toBe("en");
    expect(detectLocale("US", "es-US,es;q=0.9", ENABLED)).toBe("es");
    expect(detectLocale("US", "fr", ENABLED)).toBe("en");
  });

  it("returns nothing for unknown countries or disabled languages", () => {
    expect(detectLocale("JP", "ja", ENABLED)).toBeNull();
    expect(detectLocale(null, "fr", ENABLED)).toBeNull();
    expect(detectLocale("FR", "fr", ["en"])).toBeNull();
    expect(acceptedLanguages("fr-CA,fr;q=0.9,en;q=0.8,*;q=0.1")).toEqual(["fr", "en"]);
  });

  it("maps countries to currencies with USD as the default", () => {
    expect(currencyForCountry("DE")).toBe("EUR");
    expect(currencyForCountry("fr")).toBe("EUR");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("AU")).toBe("AUD");
    expect(currencyForCountry("CH")).toBe("CHF");
    expect(currencyForCountry("JP")).toBe("JPY");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("BR")).toBe("USD");
    expect(currencyForCountry(null)).toBe("USD");
  });

  it("reads the edge country header and recognises crawlers", () => {
    expect(countryFromHeaders(new Headers({ "x-vercel-ip-country": "fr" }))).toBe("FR");
    expect(countryFromHeaders(new Headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(countryFromHeaders(new Headers())).toBeNull();
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36")).toBe(false);
  });
});

describe("translation", () => {
  it("falls back to English and fills placeholders", () => {
    expect(translate(null, "Add to cart")).toBe("Add to cart");
    expect(translate({ "Add to cart": "Ajouter au panier" }, "Add to cart")).toBe("Ajouter au panier");
    expect(translate({}, "Show {count} more", { count: 24 })).toBe("Show 24 more");
    expect(makeTranslator(MESSAGES.fr)("Show {count} more", { count: 24 })).toBe("Afficher 24 de plus");
    expect(translate({}, "Hello {name}", {})).toBe("Hello {name}");
  });

  it("has a translation for every string in the code, in every language", () => {
    const strings = extractStrings() as string[];
    expect(strings.length).toBeGreaterThan(300);
    for (const locale of ["es", "fr", "de"] as const) {
      const dict = MESSAGES[locale]!;
      expect(strings.filter((s) => !(s in dict))).toEqual([]);
    }
  });

  it("keeps placeholders and markup markers intact in every translation", () => {
    const marks = (s: string) => [...s.matchAll(/\{\w+\}|<\/?[ab]>/g)].map((m) => m[0]).sort().join(" ");
    for (const locale of ["es", "fr", "de"] as const) {
      for (const [source, translated] of Object.entries(MESSAGES[locale]!)) expect(marks(translated), `${locale}: ${source}`).toBe(marks(source));
    }
  });
});

describe("WhatsApp links", () => {
  it("uses the one configured number", () => {
    expect(whatsappUrl()).toBe("https://wa.me/14185066697");
    expect(whatsappUrl("Hi there")).toBe("https://wa.me/14185066697?text=Hi%20there");
  });

  it("writes a first message for the page", () => {
    expect(whatsappMessage("/services/appraisal-and-valuation")).toMatch(/free appraisal/);
    expect(whatsappMessage("/services/grading-submission")).toMatch(/grading/);
    expect(whatsappMessage("/store/amazing-spider-man-300")).toMatch(/interested in this comic: https?:\/\/\S+\/store\/amazing-spider-man-300/);
    expect(whatsappMessage("/fr/store/amazing-spider-man-300")).toMatch(/\/store\/amazing-spider-man-300$/);
    expect(whatsappMessage("/contact")).toMatch(/get in touch/);
    expect(whatsappMessage("/")).toMatch(/I have a question\.$/);
  });
});

describe("business hours", () => {
  // Store time is US Central. 2026-10-05 is a Monday; CDT is UTC-5.
  it("is open during the day and says when it closes", () => {
    expect(businessStatus(new Date("2026-10-05T17:00:00Z"))).toEqual({ open: true, closes: "7:00 PM" });
  });
  it("before opening, says it opens later today", () => {
    expect(businessStatus(new Date("2026-10-05T13:00:00Z"))).toEqual({ open: false, opens: "10:00 AM", day: null });
  });
  it("after closing, names the next opening day and time", () => {
    expect(businessStatus(new Date("2026-10-06T01:30:00Z"))).toEqual({ open: false, opens: "10:00 AM", day: "Tuesday" });
    // Saturday 23:00 Central → Sunday noon.
    expect(businessStatus(new Date("2026-10-11T04:00:00Z"))).toEqual({ open: false, opens: "12:00 PM", day: "Sunday" });
  });
  it("formats clock times", () => {
    expect(clock("12:00")).toBe("12:00 PM");
    expect(clock("00:30")).toBe("12:30 AM");
  });
});
