"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { stopImpersonationAction } from "@/lib/admin/impersonation-actions";

export function ImpersonationBanner({ userName, adminName }: { userName: string; adminName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="bg-gold-400 text-ink-950" role="status">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-2 text-[13px] sm:px-8">
        <p>
          <strong>Support session:</strong> {adminName} is viewing the site as <strong>{userName}</strong>. Payments,
          password and security settings are disabled.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await stopImpersonationAction();
              router.push(res.ok ? "/admin/users" : "/admin/login");
              router.refresh();
            })
          }
          className="rounded-md bg-ink-950 px-3 py-1 text-xs font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
        >
          {pending ? "Ending…" : "End session"}
        </button>
      </div>
    </div>
  );
}
