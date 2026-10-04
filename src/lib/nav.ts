import { msg } from "@/lib/i18n/translate";

export const primaryNav = [
  { label: msg("Store"), href: "/store" },
  { label: msg("Guides"), href: "/guides" },
  { label: msg("Services"), href: "/services" },
  { label: msg("Grading"), href: "/services/grading-submission" },
  { label: msg("About"), href: "/about" },
  { label: msg("Contact"), href: "/contact" },
] as const;

export const policyPages = [
  { slug: "shipping", title: "Shipping Policy", nav: msg("Shipping") },
  { slug: "returns-and-refunds", title: "Returns & Refunds Policy", nav: msg("Returns & Refunds") },
  { slug: "authenticity-guarantee", title: "Authenticity Guarantee", nav: msg("Authenticity Guarantee") },
  { slug: "grading-terms", title: "Grading Service Terms", nav: msg("Grading Terms") },
  { slug: "privacy", title: "Privacy Policy", nav: msg("Privacy") },
  { slug: "terms-of-service", title: "Terms of Service", nav: msg("Terms of Service") },
  { slug: "cookies", title: "Cookie Policy", nav: msg("Cookies") },
  { slug: "accessibility", title: "Accessibility Statement", nav: msg("Accessibility") },
] as const;

export type PolicySlug = (typeof policyPages)[number]["slug"];
