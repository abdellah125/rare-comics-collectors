/** What a crawler sees on a page: title, description, H1, word count, canonical, robots, internal links. Pure. */
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const strip = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? null;

export function parsePage(html: string, origin: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const description = metas.map((t) => (attr(t, "name")?.toLowerCase() === "description" ? attr(t, "content") : null)).find(Boolean) ?? null;
  const robots = metas.map((t) => (attr(t, "name")?.toLowerCase() === "robots" ? attr(t, "content") : null)).find(Boolean) ?? "";
  const canonicalTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => attr(t, "rel")?.toLowerCase() === "canonical");
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]));
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  const words = strip(main).split(" ").filter((w) => /[A-Za-z0-9]/.test(w)).length;
  const links = new Set<string>();
  for (const m of main.matchAll(/<a\b[^>]*href\s*=\s*"([^"#?]+)[^"]*"/gi)) {
    const href = m[1];
    const path = href.startsWith("/") ? href : href.startsWith(origin) ? href.slice(origin.length) : null;
    if (path && !/^\/(admin|account|dashboard|cart|checkout|api)\b/.test(path)) links.add(path.replace(/\/$/, "") || "/");
  }
  return { title: title ? decode(title) : null, description: description ? decode(description) : null, noindex: /noindex/i.test(robots), canonical: canonicalTag ? attr(canonicalTag, "href") : null, h1: h1s[0] ?? null, h1Count: h1s.length, wordCount: words, links: [...links] };
}
