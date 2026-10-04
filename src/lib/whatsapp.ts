import { site } from "@/lib/site";

/**
 * WhatsApp click-to-chat links. The number lives in one place (`site.whatsapp`); every icon,
 * button and link on the site is built here. Messages are written in English on purpose: they
 * are the first thing the store reads, whatever language the visitor browses in.
 */
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${site.whatsapp.number}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** The first message, written for the page the visitor is on. */
export function whatsappMessage(pathname: string | null | undefined): string {
  const path = (pathname ?? "/").replace(/^\/(es|fr|de)(?=\/|$)/, "") || "/";
  const name = site.name;
  if (path.startsWith("/services/appraisal")) return `Hello ${name}, I would like a free appraisal of my comics.`;
  if (path.startsWith("/services/grading")) return `Hello ${name}, I have a question about submitting comics for CGC / CBCS grading.`;
  if (path.startsWith("/services/")) return `Hello ${name}, I have a question about this service: ${site.url}${path}`;
  if (path === "/services") return `Hello ${name}, I have a question about your services.`;
  if (/^\/store\/[^/]+/.test(path)) return `Hello ${name}, I am interested in this comic: ${site.url}${path}`;
  if (path.startsWith("/store") || path.startsWith("/collections") || path.startsWith("/publishers") || path.startsWith("/characters")) return `Hello ${name}, I am looking for a comic. Can you help me find it?`;
  if (path.startsWith("/cart") || path.startsWith("/checkout")) return `Hello ${name}, I have a question about my order before I pay.`;
  if (path.startsWith("/track-order") || path.startsWith("/account/orders")) return `Hello ${name}, I have a question about my order.`;
  if (path.startsWith("/contact")) return `Hello ${name}, I would like to get in touch.`;
  if (path.startsWith("/guides")) return `Hello ${name}, I have a question after reading your guide: ${site.url}${path}`;
  return `Hello ${name}, I have a question.`;
}
