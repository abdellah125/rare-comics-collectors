import { describe, expect, it } from "vitest";
import { buildIndexNowPayload, INDEXNOW_MAX_URLS, isValidIndexNowKey } from "@/lib/indexnow-payload";

describe("indexnow payload", () => {
  it("absolutises paths on the canonical origin, drops foreign hosts and de-duplicates", () => {
    const p = buildIndexNowPayload("https://www.rarecomicscollectors.com/", "indexnow-abc123def456", [
      "/store/action-comics-1",
      "store/action-comics-1",
      "https://www.rarecomicscollectors.com/store/action-comics-1",
      "https://rarecomicscollectors.com/store/other",
      "https://evil.example/x",
      " ",
      "/",
    ]);
    expect(p.host).toBe("www.rarecomicscollectors.com");
    expect(p.keyLocation).toBe("https://www.rarecomicscollectors.com/indexnow-abc123def456.txt");
    expect(p.urlList).toEqual(["https://www.rarecomicscollectors.com/store/action-comics-1", "https://www.rarecomicscollectors.com/"]);
  });

  it("caps a batch at the protocol limit", () => {
    const paths = Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, i) => `/store/p${i}`);
    expect(buildIndexNowPayload("https://example.com", "indexnow-abc123def456", paths).urlList).toHaveLength(INDEXNOW_MAX_URLS);
  });

  it("validates key shape", () => {
    expect(isValidIndexNowKey("indexnow-0123456789abcdef")).toBe(true);
    expect(isValidIndexNowKey("short")).toBe(false);
    expect(isValidIndexNowKey("has space 123456")).toBe(false);
  });
});
