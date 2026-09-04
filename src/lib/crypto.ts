import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** URL-safe random token (default 32 bytes = 43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Numeric code, zero-padded — used for recovery codes and manual verification codes. */
export function randomDigits(length = 8): string {
  const max = 10 ** length;
  const n = randomBytes(6).readUIntBE(0, 6) % max;
  return n.toString().padStart(length, "0");
}

/** Tokens are stored hashed so a database leak does not hand out live sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hmac(value: string, secret = env.sessionSecret): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function key(): Buffer {
  const raw = env.encryptionKey;
  if (!raw) {
    if (env.isProd) throw new Error("APP_ENCRYPTION_KEY is not set");
    // Deterministic dev key so local data survives restarts. Never used in production.
    return createHash("sha256").update("dev-only-encryption-key").digest();
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to 32 bytes");
  return buf;
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decrypt(payload: string): string {
  const [ivB, tagB, dataB] = payload.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64url")), decipher.final()]).toString("utf8");
}

/** Signed, expiring opaque value for things like email verification links. */
export function signValue(value: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${value}.${exp}`;
  return `${Buffer.from(body).toString("base64url")}.${hmac(body)}`;
}

export function verifySignedValue(token: string): string | null {
  const [bodyB, sig] = token.split(".");
  if (!bodyB || !sig) return null;
  const body = Buffer.from(bodyB, "base64url").toString("utf8");
  if (!safeEqual(hmac(body), sig)) return null;
  const idx = body.lastIndexOf(".");
  const exp = Number.parseInt(body.slice(idx + 1), 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return body.slice(0, idx);
}

export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible) return "•".repeat(value.length);
  return `${"•".repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`;
}
