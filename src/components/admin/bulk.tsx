"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { adminButton } from "@/components/admin/ui";
import type { ActionState } from "@/lib/validation";

type Ctx = { selected: Set<string>; toggle: (id: string) => void; setAll: (ids: string[], on: boolean) => void };
const BulkCtx = createContext<Ctx | null>(null);

export function BulkProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value = useMemo<Ctx>(
    () => ({
      selected,
      toggle: (id) =>
        setSelected((s) => {
          const n = new Set(s);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        }),
      setAll: (ids, on) =>
        setSelected((s) => {
          const n = new Set(s);
          for (const id of ids) {
            if (on) n.add(id);
            else n.delete(id);
          }
          return n;
        }),
    }),
    [selected],
  );
  return <BulkCtx.Provider value={value}>{children}</BulkCtx.Provider>;
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const ctx = useContext(BulkCtx);
  if (!ctx) return null;
  return <input type="checkbox" checked={ctx.selected.has(id)} onChange={() => ctx.toggle(id)} aria-label={`Select ${label}`} className="h-4 w-4 rounded border-ink-300 accent-brand-600" />;
}

export function SelectAllCheckbox({ ids }: { ids: string[] }) {
  const ctx = useContext(BulkCtx);
  if (!ctx) return null;
  const all = ids.length > 0 && ids.every((id) => ctx.selected.has(id));
  return <input type="checkbox" checked={all} onChange={(e) => ctx.setAll(ids, e.target.checked)} aria-label="Select all rows on this page" className="h-4 w-4 rounded border-ink-300 accent-brand-600" />;
}

export type BulkAction = { id: string; label: string; danger?: boolean; confirm?: string };

/** Toolbar that runs a server action against the selected ids. */
export function BulkActionsBar({ actions, run }: { actions: BulkAction[]; run: (actionId: string, ids: string[]) => Promise<ActionState<unknown>> }) {
  const ctx = useContext(BulkCtx);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!ctx) return null;
  const ids = [...ctx.selected];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-[13px]" aria-live="polite">
      <span className="font-medium text-ink-800">{ids.length} selected</span>
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={pending || ids.length === 0}
          className={`${a.danger ? adminButton.danger : adminButton.outline} ${adminButton.sm}`}
          onClick={() => {
            if (a.confirm && !window.confirm(a.confirm.replace("{n}", String(ids.length)))) return;
            start(async () => {
              const res = await run(a.id, ids);
              setMsg(res.message ?? (res.ok ? "Done" : "Failed"));
              if (res.ok) ctx.setAll(ids, false);
              router.refresh();
            });
          }}
        >
          {a.label}
        </button>
      ))}
      {msg && <span className="text-ink-600">{msg}</span>}
    </div>
  );
}
