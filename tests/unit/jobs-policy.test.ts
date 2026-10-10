import { describe, expect, it } from "vitest";
import { canonicalIndexNowUrls, parseRetryAfter } from "@/lib/indexnow-payload";
import { PermanentJobError, TransientJobError, classifyError, cleanError, isExclusiveType, jobPriority, queueConfig, redactPayload, retryDelayMs } from "@/lib/jobs/policy";

const opts = { baseMs: 30_000, maxMs: 6 * 3_600_000 };

describe("retry delay", () => {
  it("doubles per attempt, with jitter between half and the full step", () => {
    for (const attempt of [1, 2, 3, 4]) {
      const step = 30_000 * 2 ** (attempt - 1);
      expect(retryDelayMs(attempt, opts, () => 0)).toBe(step / 2);
      expect(retryDelayMs(attempt, opts, () => 1)).toBe(step);
      const d = retryDelayMs(attempt, opts);
      expect(d).toBeGreaterThanOrEqual(step / 2);
      expect(d).toBeLessThanOrEqual(step);
    }
  });
  it("is capped", () => {
    expect(retryDelayMs(30, opts, () => 1)).toBe(opts.maxMs);
    expect(retryDelayMs(30, opts, () => 0)).toBe(opts.maxMs / 2);
  });
  it("never retries sooner than Retry-After asks", () => {
    expect(retryDelayMs(1, { ...opts, retryAfterMs: 600_000 }, () => 0)).toBe(600_000);
  });
  it("spreads jobs that failed together", () => {
    const seen = new Set(Array.from({ length: 50 }, () => retryDelayMs(3, opts)));
    expect(seen.size).toBeGreaterThan(10);
  });
});

describe("error classes", () => {
  it("separates permanent from transient errors", () => {
    expect(classifyError(new PermanentJobError("bad payload")).kind).toBe("permanent");
    expect(classifyError(new TransientJobError("busy", 5_000))).toEqual({ kind: "transient", message: "busy", retryAfterMs: 5_000 });
    expect(classifyError(new Error("ECONNRESET")).kind).toBe("transient");
    expect(classifyError("plain string").message).toBe("plain string");
    // errors from other modules that carry permanent: true (e.g. FeedAccessError) count as permanent
    expect(classifyError(Object.assign(new Error("refused"), { permanent: true })).kind).toBe("permanent");
  });
  it("masks credentials in stored error text", () => {
    expect(cleanError("connect postgres://admin:hunter2@db.example.com:5432/rcc failed")).toBe("connect postgres://***@db.example.com:5432/rcc failed");
    expect(cleanError("401 for Authorization: Bearer abc.def-123")).toBe("401 for Authorization: Bearer ***");
  });
});

describe("priorities and exclusivity", () => {
  it("puts money and customer jobs before bulk work", () => {
    expect(jobPriority("send_email")).toBeGreaterThan(jobPriority("indexnow_ping"));
    expect(jobPriority("expire_unpaid_orders")).toBeGreaterThan(jobPriority("import_fix"));
    expect(jobPriority("crypto_check")).toBeGreaterThan(jobPriority("content_tick"));
    expect(jobPriority("import_auto_release")).toBeLessThan(0);
  });
  it("runs recurring, payout and import jobs one at a time, emails in parallel", () => {
    for (const t of ["schedule_payouts", "expire_unpaid_orders", "import_fix", "indexnow_ping", "content_tick"]) expect(isExclusiveType(t)).toBe(true);
    for (const t of ["send_email", "retry_webhook"]) expect(isExclusiveType(t)).toBe(false);
  });
  it("reads its limits from the environment, ignoring nonsense", () => {
    process.env.JOBS_LEASE_MS = "120000";
    expect(queueConfig().leaseMs).toBe(120_000);
    expect(queueConfig().heartbeatMs).toBe(30_000);
    process.env.JOBS_LEASE_MS = "12";
    expect(queueConfig().leaseMs).toBe(90_000);
    delete process.env.JOBS_LEASE_MS;
  });
});

describe("payload redaction", () => {
  it("hides secrets and masks email addresses", () => {
    const out = redactPayload(JSON.stringify({ emailLogId: "e1", to: "buyer@example.com", apiKey: "sk-123", nested: { webhookSecret: "x", note: "contact jane.doe@mail.org" } }));
    expect(out).not.toContain("sk-123");
    expect(out).not.toContain("buyer@example.com");
    expect(out).not.toContain("jane.doe@");
    expect(out).toContain("b***@example.com");
    expect(out).toContain("[redacted]");
    expect(out).toContain("e1");
  });
  it("cuts long lists and copes with broken JSON", () => {
    const out = redactPayload(JSON.stringify({ paths: Array.from({ length: 120 }, (_, i) => `/p${i}`) }));
    expect(out).toContain("70 more");
    expect(redactPayload("{nope")).toBe("(payload is not valid JSON)");
  });
});

describe("IndexNow URLs", () => {
  it("makes paths absolute on the canonical origin and reports what it left out", () => {
    const r = canonicalIndexNowUrls("https://www.example.com/", ["/store", "store/a", "https://www.example.com/store", "https://evil.test/x", "http://www.example.com/insecure", "/has space", ""]);
    expect(r.urls).toEqual(["https://www.example.com/store", "https://www.example.com/store/a"]);
    expect(r.rejected).toEqual(["https://evil.test/x", "http://www.example.com/insecure", "/has space"]);
  });
  it("reads Retry-After in seconds or as a date", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter(new Date(Date.UTC(2030, 0, 1, 0, 1)).toUTCString(), Date.UTC(2030, 0, 1))).toBe(60_000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});
