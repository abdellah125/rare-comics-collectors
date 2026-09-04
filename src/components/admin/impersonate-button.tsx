"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminButton } from "@/components/admin/ui";
import { startImpersonationAction } from "@/lib/admin/impersonation-actions";

/** Starts an audited support session as the user and opens the storefront account area. */
export function ImpersonateButton({ userId, userName }: { userId: string; userName: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={adminButton.outline}
        onClick={() => {
          if (!window.confirm(`Start a support session as ${userName}? This is recorded in the audit log and the user will see a banner.`)) return;
          start(async () => {
            const res = await startImpersonationAction(userId);
            if (!res.ok) {
              setError(res.message ?? "Could not start session");
              return;
            }
            router.push("/account");
            router.refresh();
          });
        }}
      >
        {pending ? "Starting…" : "View as user"}
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-rose-700">
          {error}
        </span>
      )}
    </span>
  );
}
