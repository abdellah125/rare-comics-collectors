import "server-only";

/**
 * Single place that reads process.env so secrets never leak into other
 * modules by accident. Everything is read lazily at call time so values set
 * at runtime (not build time) are honoured on self-hosted servers.
 */
function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV ?? "development";
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get siteUrl() {
    return str("NEXT_PUBLIC_SITE_URL", "http://localhost:3000").replace(/\/$/, "");
  },
  get sessionSecret() {
    return str("SESSION_SECRET", "dev-only-session-secret-change-me");
  },
  get encryptionKey() {
    return str("APP_ENCRYPTION_KEY");
  },
  get jobsSecret() {
    return str("JOBS_SECRET");
  },
  get uploadDir() {
    return str("UPLOAD_DIR", "./uploads");
  },
  get adminIpAllowlist(): string[] {
    return str("ADMIN_IP_ALLOWLIST")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  smtp: {
    get host() {
      return str("SMTP_HOST");
    },
    get port() {
      return Number.parseInt(str("SMTP_PORT", "587"), 10);
    },
    get user() {
      return str("SMTP_USER");
    },
    get pass() {
      return str("SMTP_PASS");
    },
    get secure() {
      return bool("SMTP_SECURE", false);
    },
    get from() {
      return str("MAIL_FROM", "Rare Comics Collectors <no-reply@localhost>");
    },
    get configured() {
      return Boolean(str("SMTP_HOST"));
    },
  },
  stripe: {
    get secretKey() {
      return str("STRIPE_SECRET_KEY");
    },
    get webhookSecret() {
      return str("STRIPE_WEBHOOK_SECRET");
    },
    get publishableKey() {
      return str("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    },
    get configured() {
      return Boolean(str("STRIPE_SECRET_KEY") && str("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"));
    },
  },
  paypal: {
    get clientId() {
      return str("PAYPAL_CLIENT_ID");
    },
    get clientSecret() {
      return str("PAYPAL_CLIENT_SECRET");
    },
    get webhookId() {
      return str("PAYPAL_WEBHOOK_ID");
    },
    get live() {
      return str("PAYPAL_ENV", "sandbox") === "live";
    },
    get configured() {
      return Boolean(str("PAYPAL_CLIENT_ID") && str("PAYPAL_CLIENT_SECRET"));
    },
  },
  get exchangeRateApiUrl() {
    return str("EXCHANGE_RATE_API_URL", "https://api.frankfurter.app/latest");
  },
  get bootstrapAdmin() {
    return { email: str("ADMIN_EMAIL"), password: str("ADMIN_PASSWORD") };
  },
};
