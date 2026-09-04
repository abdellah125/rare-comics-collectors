import "server-only";

/**
 * Process-wide cache of secrets that were generated into the database because the
 * environment did not provide them (see src/lib/secrets.ts). Kept in a separate,
 * dependency-free module so the synchronous crypto helpers can read it without
 * pulling the database client into every import graph (unit tests included).
 */
export type InstanceSecretName = "session_secret" | "encryption_key";

export const SECRET_ENV: Record<InstanceSecretName, string> = {
  session_secret: "SESSION_SECRET",
  encryption_key: "APP_ENCRYPTION_KEY",
};

const g = globalThis as unknown as { __rccSecrets?: Map<InstanceSecretName, string> };
const cache = (g.__rccSecrets ??= new Map<InstanceSecretName, string>());

export function cachedSecret(name: InstanceSecretName): string | null {
  return cache.get(name) ?? null;
}

export function rememberSecret(name: InstanceSecretName, value: string): void {
  cache.set(name, value);
}

export function secretSource(name: InstanceSecretName): "environment" | "database" | "missing" {
  if (process.env[SECRET_ENV[name]]) return "environment";
  return cache.has(name) ? "database" : "missing";
}
