import type { ReactNode } from "react";
import { connection } from "next/server";
import { SiteShell } from "@/components/site-shell";
import { MaintenancePage } from "@/components/maintenance-page";
import { SiteBanners } from "@/components/site-banners";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";

/**
 * Storefront layout. Reads marketplace settings at request time so maintenance
 * mode, announcement bars and campaigns take effect immediately.
 */
// Background jobs are not started from here: they would share the server with the pages visitors
// are waiting for. The storefront's JobBeacon pings /api/jobs/tick and the daily cron does the rest.
export const maxDuration = 60;

export default async function SiteLayout({ children }: { children: ReactNode }) {
  await connection();
  const settings = await getSettings();
  if (settings["system.maintenanceMode"]) {
    const user = await getCurrentUser();
    if (!user?.isAdmin) return <MaintenancePage message={settings["system.maintenanceMessage"]} supportEmail={settings["marketplace.supportEmail"]} />;
  }
  return <SiteShell banner={<SiteBanners />}>{children}</SiteShell>;
}
