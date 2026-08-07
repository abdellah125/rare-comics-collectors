export const primaryNav = [
  { label: "Store", href: "/store" },
  { label: "Services", href: "/services" },
  { label: "Grading", href: "/services/grading-submission" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;

export const policyPages = [
  { slug: "shipping", title: "Shipping Policy", nav: "Shipping" },
  { slug: "returns-and-refunds", title: "Returns & Refunds Policy", nav: "Returns & Refunds" },
  { slug: "authenticity-guarantee", title: "Authenticity Guarantee", nav: "Authenticity Guarantee" },
  { slug: "grading-terms", title: "Grading Service Terms", nav: "Grading Terms" },
  { slug: "privacy", title: "Privacy Policy", nav: "Privacy" },
  { slug: "terms-of-service", title: "Terms of Service", nav: "Terms of Service" },
  { slug: "cookies", title: "Cookie Policy", nav: "Cookies" },
  { slug: "accessibility", title: "Accessibility Statement", nav: "Accessibility" },
] as const;

export type PolicySlug = (typeof policyPages)[number]["slug"];
