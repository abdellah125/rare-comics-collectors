"use client";

import { useEffect } from "react";

/** Last-resort boundary when the root layout itself fails; must render its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global]", error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0d1017", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 12, color: "#fda4af" }}>Something went wrong</p>
          <h1 style={{ fontSize: 28, margin: "16px 0" }}>We couldn&apos;t load the site</h1>
          <p style={{ color: "#b0b8c8", lineHeight: 1.6 }}>The problem has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ marginTop: 24, padding: "12px 20px", borderRadius: 10, border: 0, background: "#e11d48", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
