import { describe, expect, it } from "vitest";
import { linkify, textToHtml } from "@/lib/mail-html";

describe("email html rendering", () => {
  it("escapes markup and links only http(s) urls", () => {
    const html = linkify('See <b>this</b> at https://rarecomicscollectors.com/account/orders/RCC-1, not javascript:alert(1).');
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain('<a href="https://rarecomicscollectors.com/account/orders/RCC-1"');
    expect(html).toContain("</a>,");
    expect(html).not.toContain('href="javascript');
  });

  it("keeps paragraphs, line breaks and the footer", () => {
    const html = textToHtml("Hi Dana,\n\nYour order RCC-1 shipped.\nTracking 123.\n\n— RCC", { siteName: "RCC", siteUrl: "https://rarecomicscollectors.com", footer: ["RCC · Austin, TX", "Questions? support@rarecomicscollectors.com"] });
    expect(html.match(/<p style="margin:0 0 16px">/g)?.length).toBe(3);
    expect(html).toContain("shipped.<br>Tracking 123.");
    expect(html).toContain("Questions? support@rarecomicscollectors.com");
    expect(html).not.toContain("<img");
  });
});
