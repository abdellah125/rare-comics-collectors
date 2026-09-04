"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonSizes, buttonStyles } from "@/components/ui";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/lib/account/actions";

type Row = { id: string; deviceLabel: string | null; ip: string | null; createdAt: string; lastSeenAt: string; impersonatorId: string | null; current: boolean };

export function SessionsList({ sessions, disabled }: { sessions: Row[]; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current);
  return (
    <div className="grid gap-4">
      <ul className="divide-y divide-ink-100">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium text-ink-950">
                {s.deviceLabel ?? "Unknown device"}
                {s.current && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-800">This device</span>}
                {s.impersonatorId && <span className="ml-2 rounded-full bg-gold-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-gold-800">Support session</span>}
              </p>
              <p className="text-[13px] text-ink-500">
                {s.ip ?? "IP unknown"} · signed in {new Date(s.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · last active {new Date(s.lastSeenAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
            {!s.current && (
              <button
                type="button"
                disabled={pending || disabled}
                className={`${buttonStyles.outline} ${buttonSizes.sm}`}
                onClick={() =>
                  start(async () => {
                    const res = await revokeSessionAction(s.id);
                    setMessage(res.message ?? null);
                    router.refresh();
                  })
                }
              >
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <p role="status" className="text-sm text-brand-800">
          {message}
        </p>
      )}
      {others.length > 0 && (
        <div>
          <button
            type="button"
            disabled={pending || disabled}
            className={`${buttonStyles.dark} ${buttonSizes.md}`}
            onClick={() =>
              start(async () => {
                const res = await revokeOtherSessionsAction();
                setMessage(res.message ?? null);
                router.refresh();
              })
            }
          >
            Sign out all other devices
          </button>
        </div>
      )}
    </div>
  );
}
