/**
 * Applies pending migrations and runs the idempotent seed. Used by `npm run build`
 * (so a Vercel deployment migrates and bootstraps its database) and by `npm run db:deploy`.
 *
 * Migrations need a direct connection; hosts that hand out a pooled DATABASE_URL usually
 * expose the direct one under another name, which is preferred here when present.
 */
import { spawnSync } from "node:child_process";

try {
  process.loadEnvFile?.(".env");
} catch {
  // no .env locally (CI / hosted build): the variables come from the environment
}

const direct = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!direct) {
  console.error("DATABASE_URL is not set; cannot migrate or seed.");
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: direct };
// Fixed command strings (no user input), run through the shell so `npx` resolves on every OS.
const run = (command) => {
  const result = spawnSync(command, { stdio: "inherit", env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npx prisma migrate deploy");
if (process.env.SKIP_SEED === "true") console.log("SKIP_SEED=true, seed skipped");
else run("npx tsx prisma/seed.ts");
