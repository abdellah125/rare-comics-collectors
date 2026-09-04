/**
 * Zero-install PostgreSQL for local development. `embedded-postgres` ships the
 * real server binaries for your platform (downloaded with `npm ci`); the cluster
 * lives in .postgres/ (gitignored) and survives restarts.
 *
 *   npm run db:local        # starts Postgres on localhost:5433 and keeps running (Ctrl+C stops it)
 *
 * Matching connection string for .env:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/rcc"
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.LOCAL_PG_PORT || 5433);
const databaseDir = path.resolve(".postgres");
const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password: "postgres",
  persistent: true,
  // Windows would otherwise initialise the cluster in the OS code page (WIN1252).
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (err) => console.error(String(err)),
});

if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("rcc");
} catch (err) {
  if (!/already exists/i.test(String(err))) throw err;
}
console.log(`postgres ready: postgresql://postgres:postgres@localhost:${port}/rcc`);

const stop = async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
