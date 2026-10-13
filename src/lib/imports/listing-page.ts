/**
 * Reads one listing page of the import source: the listing's own photos, its "Item Specifics" and
 * whether the source still offers it. Pure (text in, facts out), so it is unit-tested with saved pages.
 *
 * Only this listing's gallery is read (`<div class="item primary-N"><img …>`): thumbnails of other
 * listings elsewhere on the page are never taken for photos of this book.
 */
export type ListingPhoto = { hash: string; large: string; small: string };

export type ListingPage = {
  photos: ListingPhoto[];
  /** label → value, as the seller filled them in ("Publisher" → "Marvel") */
  specifics: Record<string, string>;
  availability: "in_stock" | "out_of_stock" | null;
};

const PHOTO_HOST = "https://img.hipcomic.com/p/";

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** An anti-bot interstitial instead of the page: the caller stops and does not try another way in. */
export function isChallengePage(html: string): boolean {
  return /<title>\s*(Just a moment|Attention Required|Access denied)/i.test(html) || /challenge-platform|cf-chl-|id="challenge-form"/i.test(html);
}

export function parseListingPage(html: string): ListingPage {
  const photos: ListingPhoto[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/class="item primary-\d+"[^>]*>\s*<img[^>]*\bsrc="https:\/\/img\.hipcomic\.com\/p\/([0-9a-f]{16,64})(?:-\d+)?\.jpg"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    photos.push({ hash: m[1], large: `${PHOTO_HOST}${m[1]}-800.jpg`, small: `${PHOTO_HOST}${m[1]}-300.jpg` });
  }

  const specifics: Record<string, string> = {};
  const block = /<span>\s*Item Specifics\s*<\/span>\s*<\/h5>\s*<dl[^>]*>([\s\S]*?)<\/dl>/i.exec(html);
  if (block) {
    for (const m of block[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
      const label = decode(m[1]);
      const value = decode(m[2]);
      if (label && value && value.length <= 200 && !/^(not specified|n\/a|unknown|none|-+)$/i.test(value)) specifics[label] = value;
    }
  }

  const avail = /"availability"\s*:\s*"https?:\\?\/\\?\/schema\.org\\?\/(\w+)"/.exec(html)?.[1] ?? null;
  const availability = avail === null ? null : /^InStock$/i.test(avail) ? "in_stock" : /^(OutOfStock|SoldOut|Discontinued)$/i.test(avail) ? "out_of_stock" : null;
  return { photos, specifics, availability };
}

/** A photo kept in our own storage: `…/products/hip/<hash>-800.jpg`, with a 300 px sibling beside it. */
export const STORED_PHOTO = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/products\/hip\/[0-9a-f]{16,64}-800\.jpg$/;
export const storedPhotoPath = (hash: string, size: 300 | 800) => `products/hip/${hash}-${size}.jpg`;
