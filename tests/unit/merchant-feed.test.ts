import { describe, expect, it } from "vitest";
import { buildFeedXml, escapeXml, feedDescription, feedPrice, feedTitle, productToFeedItem, type FeedContext, type FeedProductRow } from "@/lib/merchant-feed-xml";

const ctx: FeedContext = { siteUrl: "https://www.rarecomicscollectors.com", currency: "USD", houseSellerId: "rare-comics-collectors", houseSellerName: "Rare Comics Collectors", shipping: { country: "US", service: "Insured standard", price: 0 } };

const row = (over: Partial<FeedProductRow> = {}): FeedProductRow => ({
  sku: "IMP-299",
  slug: "incredible-hulk-181-cgc-3-5",
  title: "Incredible Hulk",
  issue: "#181",
  publisher: "Marvel Comics",
  year: 1974,
  era: "Bronze Age",
  grader: "CGC",
  grade: "3.5",
  label: "Universal Blue",
  certNumber: null,
  price: 290000,
  compareAt: 350000,
  stock: 1,
  keyIssue: "First full appearance of Wolverine",
  summary: "Incredible Hulk #181 (Marvel Comics, 1974) — First full appearance of Wolverine. CGC 3.5.",
  description: "Available for sale is Incredible Hulk #181 graded by CGC in 3.5 VG- condition. A grail & a key.",
  highlights: ["First full appearance of Wolverine", "CGC 3.5"],
  attributes: { Character: "Hulk", "Page quality": "Off-white pages" },
  weightGrams: 450,
  images: [{ url: "/covers/incredible-hulk-181.webp" }, { url: "https://cdn.example.com/back.jpg" }],
  category: { name: "Bronze Age (1970–1985)" },
  seller: { slug: "lone-star-slabs", displayName: "Lone Star Slabs" },
  ...over,
});

describe("merchant feed items", () => {
  it("maps a listing with sale price, absolute urls, seller and identifiers", () => {
    const r = productToFeedItem(row(), ctx);
    expect("item" in r).toBe(true);
    const item = ("item" in r ? r.item : null)!;
    expect(item.id).toBe("IMP-299");
    expect(item.title).toBe("Incredible Hulk #181 (1974) — CGC 3.5");
    expect(item.link).toBe("https://www.rarecomicscollectors.com/store/incredible-hulk-181-cgc-3-5");
    expect(item.imageLink).toBe("https://www.rarecomicscollectors.com/covers/incredible-hulk-181.webp");
    expect(item.additionalImageLinks).toEqual(["https://cdn.example.com/back.jpg"]);
    expect(item.price).toBe(350000);
    expect(item.salePrice).toBe(290000);
    expect(item.availability).toBe("in_stock");
    expect(item.condition).toBe("used");
    expect(item.brand).toBe("Marvel Comics");
    expect(item.sellerId).toBe("lone-star-slabs");
    expect(item.productTypes).toContain("Comics > Publishers > Marvel Comics");
    expect(item.description).toContain("Key issue: First full appearance of Wolverine.");
  });

  it("skips listings Google would disapprove and says why", () => {
    expect(productToFeedItem(row({ images: [] }), ctx)).toEqual({ skip: { id: "IMP-299", reason: "no product image" } });
    expect(productToFeedItem(row({ price: 0 }), ctx)).toEqual({ skip: { id: "IMP-299", reason: "price is not positive" } });
    expect(productToFeedItem(row({ sku: "   " }), ctx)).toEqual({ skip: { id: "incredible-hulk-181-cgc-3-5", reason: "missing SKU (feed id)" } });
  });

  it("falls back to the house seller and omits sale price when not discounted", () => {
    const r = productToFeedItem(row({ seller: null, compareAt: null }), ctx);
    const item = ("item" in r ? r.item : null)!;
    expect(item.sellerId).toBe("rare-comics-collectors");
    expect(item.sellerName).toBe("Rare Comics Collectors");
    expect(item.price).toBe(290000);
    expect(item.salePrice).toBeUndefined();
  });

  it("keeps titles within 150 characters and raw books labelled honestly", () => {
    const long = row({ title: "A".repeat(200), grader: "Raw", grade: "6.0", label: "Ungraded" });
    expect(feedTitle(long).length).toBeLessThanOrEqual(150);
    expect(feedTitle(row({ grader: "Raw", grade: "6.0", label: "Ungraded" }))).toContain("Raw, graded 6.0");
    expect(feedTitle(row({ label: "Signature Series (Yellow)" }))).toBe("Incredible Hulk #181 (1974) — CGC 3.5 Signature Series");
    expect(feedDescription(row()).length).toBeLessThanOrEqual(5000);
  });

  it("serialises well-formed, escaped XML with every required attribute", () => {
    const r = productToFeedItem(row(), ctx);
    const item = ("item" in r ? r.item : null)!;
    const xml = buildFeedXml({ title: "Rare Comics Collectors — graded comics", link: ctx.siteUrl, description: "Test", items: [item], skipped: [{ id: "IMP-346", reason: "no product image" }], generatedAt: new Date("2026-09-08T00:00:00Z") });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    for (const t of ["<g:id>IMP-299</g:id>", "<g:availability>in_stock</g:availability>", "<g:price>3500.00 USD</g:price>", "<g:sale_price>2900.00 USD</g:sale_price>", "<g:condition>used</g:condition>", "<g:identifier_exists>no</g:identifier_exists>", "<g:google_product_category>Media &gt; Books</g:google_product_category>", "<g:shipping><g:country>US</g:country><g:service>Insured standard</g:service><g:price>0.00 USD</g:price></g:shipping>", "<g:shipping_weight>0.45 kg</g:shipping_weight>", "<g:external_seller_id>lone-star-slabs</g:external_seller_id>"]) {
      expect(xml).toContain(t);
    }
    expect(xml).toContain("A grail &amp; a key.");
    expect(xml).not.toContain("<g:gtin>");
    expect(xml).not.toContain("<g:mpn>");
    expect(xml).toContain("IMP-346 (no product image)");
    expect(xml).not.toMatch(/<g:[a-z_]+><\/g:[a-z_]+>/);
  });

  it("escapes and strips what XML cannot carry", () => {
    expect(escapeXml('Tom & Jerry <"quoted"> bell')).toBe("Tom &amp; Jerry &lt;&quot;quoted&quot;&gt; bell");
    expect(feedPrice(324_99, "USD")).toBe("324.99 USD");
  });
});
