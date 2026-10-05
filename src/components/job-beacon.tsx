"use client";

import { useEffect } from "react";

const KEY = "rcc_jobs_ping";

/**
 * Asks the server to work through its job queue, at most once every two minutes per browser.
 * Background work (scheduled releases, emails, syncs) then runs in a request of its own.
 */
export function JobBeacon() {
  useEffect(() => {
    const ping = () => {
      try {
        const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
        if (Date.now() - last < 120_000) return;
        window.sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        // storage blocked: ping anyway, the server limits itself
      }
      fetch("/api/jobs/tick", { keepalive: true, cache: "no-store" }).catch(() => {});
    };
    const t = window.setTimeout(ping, 4_000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
