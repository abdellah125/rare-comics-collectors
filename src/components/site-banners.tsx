import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { ImpersonationBanner } from "@/components/impersonation-banner";

/**
 * Request-time banners above the header: admin impersonation notice,
 * marketplace announcement bar and any active global campaign.
 */
export async function SiteBanners() {
  const now = new Date();
  const [settings, user, campaign] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    db.campaign.findFirst({
      where: {
        isActive: true,
        placement: "global_bar",
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
      },
      orderBy: { updatedAt: "desc" },
      select: { title: true, ctaHref: true, ctaLabel: true },
    }),
  ]);
  const audiences = ["all", ...(user?.isAdmin ? ["admins"] : []), ...(user?.seller ? ["sellers"] : user ? ["buyers"] : [])];
  const announcements = await db.announcement.findMany({
    where: { isActive: true, audience: { in: audiences }, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true, title: true, body: true, level: true },
  });
  const announcement = settings["marketplace.announcementBar"].trim();
  return (
    <>
      {user?.impersonator && <ImpersonationBanner userName={user.name} adminName={user.impersonator.name} />}
      {announcements.map((a) => (
        <div key={a.id} role="status" className={a.level === "critical" ? "bg-rose-700 text-white" : a.level === "warning" ? "bg-amber-400 text-ink-950" : a.level === "success" ? "bg-emerald-600 text-white" : "bg-ink-950 text-white"}>
          <p className="mx-auto max-w-7xl px-5 py-2 text-center text-[13px] sm:px-8">
            <strong>{a.title}</strong> <span className="opacity-90">— {a.body.length > 160 ? a.body.slice(0, 160) + "…" : a.body}</span>
          </p>
        </div>
      ))}
      {(announcement || campaign) && (
        <div className="bg-brand-600 text-white">
          <p className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2 text-center text-[13px] font-medium sm:px-8">
            <span>{campaign?.title ?? announcement}</span>
            {campaign?.ctaHref && campaign.ctaLabel && (
              <Link href={campaign.ctaHref} className="underline underline-offset-4 hover:text-brand-100">
                {campaign.ctaLabel}
              </Link>
            )}
          </p>
        </div>
      )}
    </>
  );
}
