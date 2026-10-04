"use client";

import { useActionState, useRef } from "react";
import { adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { runSeoStepAction, setClusterStatusAction, setKeywordStatusAction } from "@/lib/admin/actions/seo";
import type { ActionState } from "@/lib/validation";

const STATUS_OPTIONS: [string, string][] = [["discovered", "Discovered"], ["analyzed", "Analyzed"], ["targeting", "Targeting"], ["content_needed", "Content needed"], ["optimizing", "Optimizing"], ["published", "Published"], ["ranking", "Ranking"], ["needs_improvement", "Needs improvement"]];

/** One pipeline step as a small form: its inputs, its cost, a pending state and the outcome. */
export function SeoStep({ step, label, cost, children, disabled, primary }: { step: string; label: string; cost: string; children?: React.ReactNode; disabled?: boolean; primary?: boolean }) {
  const [state, action, pending] = useActionState<ActionState | undefined, FormData>(runSeoStepAction, undefined);
  return (
    <form action={action} className="grid gap-2 rounded-xl border border-ink-200 bg-white p-3" aria-busy={pending}>
      <input type="hidden" name="step" value={step} />
      {children}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="submit" disabled={pending || disabled} className={`${primary ? adminButton.primary : adminButton.outline} ${adminButton.sm}`}>
          {pending ? "Working…" : label}
        </button>
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${cost === "Free" ? "text-emerald-700" : "text-amber-700"}`}>{cost}</span>
      </div>
      {state?.message && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-2.5 py-1.5 text-[12px] ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-700"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SeoActionsPanel({ configured, aiConfigured }: { configured: boolean; aiConfigured: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SeoStep step="test" label="Test connection" cost="Free" disabled={!configured} />
      <SeoStep step="search_console" label="Sync Search Console" cost="Free" disabled={!configured} primary />
      <SeoStep step="candidates" label="Add catalogue candidates" cost="Free" />
      <SeoStep step="analyse" label="Re-analyse everything" cost="Free" />
      <SeoStep step="metrics" label="Fetch metrics" cost="≈ 12 + 0.15 per keyword" disabled={!configured}>
        <label className="text-[12px] text-ink-700">
          Unmeasured keywords to measure (most relevant first)
          <select name="limit" defaultValue="200" className={`${adminSelect} mt-1`}>
            <option value="100">100 (≈ 27 credits)</option>
            <option value="200">200 (≈ 42 credits)</option>
            <option value="400">400 (≈ 72 credits)</option>
            <option value="700">700 (≈ 117 credits)</option>
          </select>
        </label>
      </SeoStep>
      <SeoStep step="research" label="Research seeds" cost="≈ 45–95 per seed" disabled={!configured}>
        <label className="text-[12px] text-ink-700">
          Seed keywords (1–5, one per line)
          <textarea name="seeds" rows={2} required className={`${adminTextarea} mt-1`} placeholder={"silver age key issues\nbuy rare comics"} />
        </label>
      </SeoStep>
      <SeoStep step="serp" label="Read Google results" cost="≈ 5 per keyword" disabled={!configured}>
        <label className="text-[12px] text-ink-700">
          Best unchecked primary keywords
          <select name="count" defaultValue="5" className={`${adminSelect} mt-1`}>
            <option value="3">3 (≈ 15 credits)</option>
            <option value="5">5 (≈ 25 credits)</option>
            <option value="10">10 (≈ 50 credits)</option>
          </select>
        </label>
      </SeoStep>
      <SeoStep step="gap" label="Find keyword gap" cost="≈ 25–30" disabled={!configured}>
        <label className="text-[12px] text-ink-700">
          Competitor domain
          <input name="domain" required className={`${adminInput} mt-1`} placeholder="example.com" />
        </label>
      </SeoStep>
      <SeoStep step="own_rankings" label="Check Google top 100" cost="≈ 25–30" disabled={!configured} />
      <SeoStep step="competitors" label="Find top competitors" cost="≈ 22" disabled={!configured} />
      <SeoStep step="inspect_rivals" label="Inspect competitor pages" cost="Free" />
      <SeoStep step="audit" label="Run site audit" cost="Free" />
      <SeoStep step="ai" label="Write the analysis" cost={aiConfigured ? "No OpenSEO credits" : "Needs ANTHROPIC_API_KEY"} disabled={!aiConfigured} />
    </div>
  );
}

/** Status dropdown that saves on change. "Automatic" hands the status back to the system. */
export function StatusSelect({ kind, id, status, manual }: { kind: "keyword" | "cluster"; id: string; status: string; manual: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={kind === "keyword" ? setKeywordStatusAction : setClusterStatusAction}>
      <input type="hidden" name={kind === "keyword" ? "id" : "key"} value={id} />
      <select name="status" defaultValue={status} onChange={() => ref.current?.requestSubmit()} aria-label="Status" className={`h-8 rounded-lg border px-1.5 text-[12px] ${manual ? "border-brand-300 bg-brand-50 text-brand-900" : "border-ink-300 bg-white text-ink-800"}`}>
        {STATUS_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
        {manual && <option value="auto">↺ Automatic</option>}
      </select>
    </form>
  );
}
