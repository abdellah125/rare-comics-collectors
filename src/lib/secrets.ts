import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { cachedSecret, rememberSecret, SECRET_ENV, type InstanceSecretName } from "@/lib/secrets-cache";

const NAMES: InstanceSecretName[] = ["session_secret", "encryption_key"];

/**
 * Signing and encryption keys the environment did not provide are generated once
 * (32 random bytes) and stored in the AppSecret table, so a deployment that only has
 * DATABASE_URL still gets unique, unpredictable keys instead of a value anyone can
 * read in the source. Environment variables always win when present; set them for
 * the strongest posture, because then the key lives apart from the data it protects.
 *
 * Called from instrumentation.ts at server start and, as a safety net, from the
 * request paths that sign or encrypt. After the first load it is a no-op.
 */
export async function ensureInstanceSecrets(): Promise<void> {
  const missing = NAMES.filter((name) => !process.env[SECRET_ENV[name]] && !cachedSecret(name));
  for (const name of missing) {
    let row = await db.appSecret.findUnique({ where: { name } });
    if (!row) {
      const value = randomBytes(32).toString("base64");
      row = await db.appSecret.create({ data: { name, value } }).catch(async (err: unknown) => {
        // Two cold instances raced to create it: keep whichever won.
        const again = await db.appSecret.findUnique({ where: { name } });
        if (again) return again;
        throw err;
      });
    }
    rememberSecret(name, row.value);
  }
}
