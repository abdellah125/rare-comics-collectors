"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adminButton, adminSelect } from "@/components/admin/ui";
import { setUserRoleAction } from "@/lib/admin/actions/users";

export function RoleSelect({ userId, currentRoleId, roles, disabled }: { userId: string; currentRoleId: string | null; roles: { id: string; name: string }[]; disabled?: boolean }) {
  const [value, setValue] = useState(currentRoleId ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <select value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled || pending} className={adminSelect} aria-label="Admin role">
        <option value="">No admin access</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || pending || value === (currentRoleId ?? "")}
          className={adminButton.dark}
          onClick={() => {
            if (!window.confirm(value ? "Grant this role? The user will be signed out and must sign in again." : "Remove admin access?")) return;
            start(async () => {
              const res = await setUserRoleAction(userId, value || null);
              setMsg(res.message ?? null);
              router.refresh();
            });
          }}
        >
          {pending ? "Saving…" : "Apply role"}
        </button>
        {msg && <span className="text-[12px] text-ink-600">{msg}</span>}
      </div>
    </div>
  );
}
