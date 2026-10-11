import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/env";

/** The port decides implicit TLS for the standard ports; SMTP_SECURE only matters for others. */
describe("SMTP TLS mode", () => {
  const saved = { port: process.env.SMTP_PORT, secure: process.env.SMTP_SECURE };
  afterEach(() => {
    process.env.SMTP_PORT = saved.port;
    process.env.SMTP_SECURE = saved.secure;
  });
  it("uses STARTTLS on 587 even when SMTP_SECURE says true (Gmail's wrong-version-number error)", () => {
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "true";
    expect(env.smtp.secure).toBe(false);
  });
  it("uses implicit TLS on 465 even when SMTP_SECURE says false", () => {
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "false";
    expect(env.smtp.secure).toBe(true);
  });
  it("follows SMTP_SECURE on other ports", () => {
    process.env.SMTP_PORT = "2525";
    process.env.SMTP_SECURE = "true";
    expect(env.smtp.secure).toBe(true);
  });
});
