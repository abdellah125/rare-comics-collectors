import { describe, expect, it } from "vitest";
import { STORED_PHOTO, isChallengePage, parseListingPage, storedPhotoPath } from "@/lib/imports/listing-page";

const A = "11d1ac51dafd6929b574aa6ad904dfa3";
const B = "a25815587828508b65b71898ddadd8fa";
const OTHER = "ffffffffffffffffffffffffffffffff";
const page = `<html><head><title>Fantastic Four 9 CGC 6.5</title>
<meta property="og:image" content="https://img.hipcomic.com/p/${A}.jpg">
<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","price":1900,"availability": "https:\/\/schema.org\/OutOfStock"}}</script></head><body>
<div class="item primary-0"> <img src="https://img.hipcomic.com/p/${A}-800.jpg" alt="X" data-zoom-image="https://img.hipcomic.com/p/${A}.jpg"></div>
<div class="item primary-1"> <img src="https://img.hipcomic.com/p/${B}-800.jpg" alt="X" data-zoom-image="https://img.hipcomic.com/p/${B}.jpg"></div>
<div class="q-thumbnails"><div class="item"> <img src="https://img.hipcomic.com/p/${A}-300.jpg"></div></div>
<div class="related"><div class="item"> <img src="https://img.hipcomic.com/p/${OTHER}-300.jpg"></div></div>
<h5 class="headline"><span>Item Specifics</span></h5> <dl class="dl-horizontal"> <dt>Series Name</dt> <dd>Fantastic Four (1961)</dd> <dt>Issue Number</dt> <dd>9</dd> <dt>Publisher</dt> <dd>Marvel</dd> <dt>Main Character</dt> <dd>Fantastic Four &amp; Sub-Mariner</dd> <dt>Genre</dt> <dd>Not Specified</dd> </dl>
</body></html>`;

describe("listing page reader", () => {
  it("takes this listing's gallery photos in order, and nobody else's thumbnails", () => {
    const r = parseListingPage(page);
    expect(r.photos.map((p) => p.hash)).toEqual([A, B]);
    expect(r.photos[0].large).toBe(`https://img.hipcomic.com/p/${A}-800.jpg`);
    expect(r.photos[0].small).toBe(`https://img.hipcomic.com/p/${A}-300.jpg`);
  });
  it("reads the seller's item specifics and skips empty placeholders", () => {
    const r = parseListingPage(page);
    expect(r.specifics).toEqual({ "Series Name": "Fantastic Four (1961)", "Issue Number": "9", Publisher: "Marvel", "Main Character": "Fantastic Four & Sub-Mariner" });
  });
  it("reads availability and copes with a page that has neither photos nor details", () => {
    expect(parseListingPage(page).availability).toBe("out_of_stock");
    expect(parseListingPage("<html><body>nothing</body></html>")).toEqual({ photos: [], specifics: {}, availability: null });
  });
  it("recognises an anti-bot page", () => {
    expect(isChallengePage("<html><head><title>Just a moment...</title></head></html>")).toBe(true);
    expect(isChallengePage(page)).toBe(false);
  });
  it("names stored copies so the 300 px sibling can be derived", () => {
    expect(storedPhotoPath(A, 800)).toBe(`products/hip/${A}-800.jpg`);
    expect(STORED_PHOTO.test(`https://abc123.public.blob.vercel-storage.com/products/hip/${A}-800.jpg`)).toBe(true);
    expect(STORED_PHOTO.test(`https://img.hipcomic.com/p/${A}-800.jpg`)).toBe(false);
  });
});
