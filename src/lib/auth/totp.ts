import "server-only";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { createHash, randomBytes } from "node:crypto";

const ISSUER = "Rare Comics Collectors";

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

export function totpUri(secret: string, label: string): string {
  return totp(secret, label).toString();
}

export async function totpQrDataUrl(secret: string, label: string): Promise<string> {
  return QRCode.toDataURL(totpUri(secret, label), { margin: 1, width: 220 });
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secret: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const delta = totp(secret, "verify").validate({ token: clean, window: 1 });
  return delta !== null;
}

export function currentTotp(secret: string): string {
  return totp(secret, "gen").generate();
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}
