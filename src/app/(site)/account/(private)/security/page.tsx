import type { Metadata } from "next";
import { AppealForm } from "@/components/account/appeal-form";
import { PasswordForm } from "@/components/account/password-form";
import { SessionsList } from "@/components/account/sessions-list";
import { TwoFactorPanel } from "@/components/account/two-factor";
import { PageHeader, Panel } from "@/components/account/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { statusLabel } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Security", description: "Password, two-factor authentication and signed-in devices.", path: "/account/security", noIndex: true });

export default async function SecurityPage() {
  const user = await requireUser({ next: "/account/security" });
  const [profile, sessions, events, violations, appeals] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { twoFactorEnabled: true, roleId: true, lastLoginAt: true, lastLoginIp: true, status: true, statusReason: true, restrictionsJson: true } }),
    db.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, deviceLabel: true, ip: true, createdAt: true, lastSeenAt: true, impersonatorId: true },
    }),
    db.securityEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, type: true, ip: true, createdAt: true } }),
    db.violation.findMany({ where: { userId: user.id, status: "active" }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, severity: true, actionTaken: true, description: true, expiresAt: true, createdAt: true } }),
    db.appeal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, status: true, decisionNote: true, createdAt: true } }),
  ]);
  const impersonated = Boolean(user.impersonator);
  const restrictions = (JSON.parse(profile.restrictionsJson || "[]") as string[]).map(statusLabel);
  const standingIssue = profile.status !== "active" || violations.length > 0;

  return (
    <div className="grid gap-8">
      <PageHeader title="Security" lead="Keep your account locked down: strong password, two-factor authentication and a short list of trusted devices." />
      {impersonated && (
        <p role="status" className="rounded-lg bg-gold-400/15 px-4 py-3 text-sm text-gold-800 ring-1 ring-gold-400/40">
          Security settings are read-only during a support session.
        </p>
      )}
      {standingIssue && (
        <Panel title="Account standing" description={profile.status === "active" ? "Policy notices on your account." : `Your account is ${profile.status}${profile.statusReason ? `: ${profile.statusReason}` : ""}.`}>
          {restrictions.length > 0 && <p className="mb-3 text-sm text-ink-800">Current restrictions: {restrictions.join(", ")}.</p>}
          <ul className="mb-4 divide-y divide-ink-100 text-sm">
            {violations.map((v) => (
              <li key={v.id} className="py-2">
                <p className="font-semibold text-ink-900">
                  {statusLabel(v.type)} · {v.severity} · {statusLabel(v.actionTaken)}
                  {v.expiresAt && <span className="font-normal text-ink-500"> until {v.expiresAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>}
                </p>
                <p className="text-ink-700">{v.description}</p>
              </li>
            ))}
          </ul>
          {appeals[0]?.status === "pending" ? (
            <p className="text-sm text-ink-700">Your appeal from {appeals[0].createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })} is under review.</p>
          ) : (
            <>
              {appeals[0] && <p className="mb-3 text-sm text-ink-700">Last appeal: {appeals[0].status}{appeals[0].decisionNote ? ` — ${appeals[0].decisionNote}` : ""}</p>}
              {!impersonated && <AppealForm violations={violations.map((v) => ({ id: v.id, label: `${statusLabel(v.type)} (${statusLabel(v.actionTaken)})` }))} />}
            </>
          )}
        </Panel>
      )}
      <Panel title="Two-factor authentication" description={profile.roleId ? "Required for admin access. Codes come from an authenticator app such as 1Password, Authy or Google Authenticator." : "Adds a 6-digit code from an authenticator app to every sign-in."}>
        <TwoFactorPanel enabled={profile.twoFactorEnabled} disabled={impersonated} />
      </Panel>
      <Panel title="Password" description="Changing your password signs out every other device.">
        <PasswordForm disabled={impersonated} />
      </Panel>
      <Panel title="Signed-in devices" description="Sessions that can currently access your account.">
        <SessionsList sessions={sessions.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === user.session.id }))} disabled={impersonated} />
      </Panel>
      <Panel title="Recent security activity" description="Sign-ins, password changes and other sensitive events.">
        <ul className="divide-y divide-ink-100 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span className="text-ink-800">{e.type.replace(/_/g, " ")}</span>
              <span className="text-ink-500">
                {e.ip ?? ""} · {e.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </li>
          ))}
          {events.length === 0 && <li className="py-2 text-ink-500">No events recorded yet.</li>}
        </ul>
      </Panel>
    </div>
  );
}
