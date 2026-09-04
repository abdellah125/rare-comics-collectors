import { execSync } from "node:child_process";

/** Seeds deterministic e2e accounts through the app's own crypto/password helpers. */
export default function globalSetup() {
  execSync("npx tsx --conditions=react-server tests/e2e/seed.ts", { stdio: "inherit" });
}
