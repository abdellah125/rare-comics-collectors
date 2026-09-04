import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashToken, maskSecret, safeEqual, signValue, verifySignedValue } from "@/lib/crypto";
import { verifyStripeSignature } from "@/lib/payments/providers/stripe";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("crypto", () => {
  it("encrypts and decrypts with AES-GCM", () => {
    const payload = encrypt('{"iban":"DE89 3704 0044 0532 0130 00"}');
    expect(payload).not.toContain("DE89");
    expect(decrypt(payload)).toContain("DE89");
    expect(() => decrypt(payload.slice(0, -4) + "AAAA")).toThrow();
  });

  it("signs values with an expiry", () => {
    const token = signValue("user-1", 60);
    expect(verifySignedValue(token)).toBe("user-1");
    expect(verifySignedValue(token + "x")).toBeNull();
    expect(verifySignedValue(signValue("user-1", -1))).toBeNull();
  });

  it("hashes tokens deterministically and compares in constant time", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(safeEqual("a", "a")).toBe(true);
    expect(safeEqual("a", "ab")).toBe(false);
  });

  it("masks secrets", () => {
    expect(maskSecret("sk_live_1234567890")).not.toContain("live_12");
    expect(maskSecret("sk_live_1234567890")).toMatch(/7890$/);
  });
});

describe("stripe webhook signature", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const sign = (t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  it("accepts a fresh, correctly signed payload", () => {
    expect(verifyStripeSignature(body, sign(Math.floor(Date.now() / 1000)), secret)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and stale timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature(body + " ", sign(now), secret)).toBe(false);
    expect(verifyStripeSignature(body, sign(now), "other")).toBe(false);
    expect(verifyStripeSignature(body, sign(now - 3600), secret)).toBe(false);
    expect(verifyStripeSignature(body, null, secret)).toBe(false);
    expect(verifyStripeSignature(body, sign(now), "")).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks after the limit inside the window", () => {
    resetRateLimit("t:1");
    expect(rateLimit("t:1", 2, 60_000).ok).toBe(true);
    expect(rateLimit("t:1", 2, 60_000).ok).toBe(true);
    const third = rateLimit("t:1", 2, 60_000);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    resetRateLimit("t:1");
    expect(rateLimit("t:1", 2, 60_000).ok).toBe(true);
  });
});
