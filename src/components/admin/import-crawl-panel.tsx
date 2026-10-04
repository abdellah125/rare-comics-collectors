"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Field, Tone, adminButton, adminInput } from "@/components/admin/ui";
import { crawlTickAction, setCrawlStatusAction, startCrawlAction } from "@/lib/admin/actions/imports";
import type { CrawlProgress } from "@/lib/imports/crawl";
import type { ActionState } from "@/lib/validation";

const STATUS: Record<string, { label: string; tone: "brand" | "warning" | "danger" | "success" }> = {
  running: { label: "Running", tone: "brand" },
  paused: { label: "Paused", tone: "warning" },
  blocked: { label: "Stopped by the source", tone: "danger" },
  completed: { label: "Completed", tone: "success" },
};

/**
 * Progress of the page-by-page catalogue import. While it is open and the import is running it
 * asks the server every few seconds to process the next page when one is due, so the import
 * moves on even on a quiet site; closing the page does not stop it (a background job continues).
 */
export function ImportCrawlPanel({ initial, canManage }: { initial: CrawlProgress | null; canManage: boolean }) {
  const [progress, setProgress] = useState<CrawlProgress | null>(initial);
  const [startState, startAction, starting] = useActionState<ActionState | undefined, FormData>(startCrawlAction, undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const busy = useRef(false);
  const status = progress?.status;

  useEffect(() => {
    if (startState?.ok) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startState]);
  useEffect(() => {
    if (status !== "running") return;
    const tick = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const next = await crawlTickAction();
        if (next) setProgress(next);
      } catch {
        // a dropped request: the next tick tries again
      } finally {
        busy.current = false;
      }
    };
    const timer = window.setInterval(tick, 7_000);
    return () => window.clearInterval(timer);
  }, [status]);

  const setStatus = (to: "running" | "paused") =>
    start(async () => {
      if (progress) await setCrawlStatusAction(progress.id, to);
      const next = await crawlTickAction();
      if (next) setProgress(next);
      router.refresh();
    });

  const startForm = canManage && (!progress || progress.status === "completed") && (
    <form action={startAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4">
      <Field label="First page">
        <input name="startPage" type="number" min={1} max={5000} defaultValue={1} className={`${adminInput} w-28`} />
      </Field>
      <Field label="Last page">
        <input name="endPage" type="number" min={1} max={5000} defaultValue={208} className={`${adminInput} w-28`} />
      </Field>
      <button type="submit" disabled={starting} className={adminButton.primary}>
        {starting ? "Starting…" : progress ? "Run again" : "Start import"}
      </button>
      {startState?.message && <p role={startState.ok ? "status" : "alert"} className={`basis-full text-[13px] ${startState.ok ? "text-emerald-800" : "text-rose-700"}`}>{startState.message}</p>}
    </form>
  );

  if (!progress) {
    return (
      <div>
        <p className="text-[13px] text-ink-600">No page import has run yet.</p>
        {startForm}
      </div>
    );
  }
  const s = STATUS[progress.status] ?? { label: progress.status, tone: "warning" as const };
  const pct = Math.min(100, Math.round((progress.pagesDone / Math.max(1, progress.pagesTotal)) * 100));
  const cells: [string, string][] = [
    ["Pages processed", `${progress.pagesDone} / ${progress.pagesTotal}`],
    ["Current page", progress.currentPage === null ? "—" : String(progress.currentPage)],
    ["Products found", progress.found.toLocaleString("en-US")],
    ["Products imported", progress.imported.toLocaleString("en-US")],
    ["Already in the queue", progress.updated.toLocaleString("en-US")],
    ["Duplicates", progress.duplicates.toLocaleString("en-US")],
    ["Errors", progress.errors.toLocaleString("en-US")],
  ];
  return (
    <div data-testid="crawl-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[13px] text-ink-700">
          <Tone tone={s.tone}>{s.label}</Tone>
          <span>
            Pages {progress.startPage}–{progress.endPage}
          </span>
        </p>
        {canManage && (
          <span className="flex gap-2">
            {progress.status === "running" && (
              <button type="button" disabled={pending} onClick={() => setStatus("paused")} className={`${adminButton.outline} ${adminButton.sm}`}>
                Pause
              </button>
            )}
            {(progress.status === "paused" || progress.status === "blocked") && (
              <button type="button" disabled={pending} onClick={() => setStatus("running")} className={`${adminButton.primary} ${adminButton.sm}`}>
                {progress.status === "blocked" ? "Try again" : "Resume"}
              </button>
            )}
          </span>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.pagesTotal} aria-valuenow={progress.pagesDone} aria-label="Pages processed">
        <div className={`h-full rounded-full ${progress.status === "blocked" ? "bg-rose-500" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {cells.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">{label}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink-950">{value}</dd>
          </div>
        ))}
      </dl>
      {progress.message && <p className={`mt-3 text-[13px] ${progress.status === "blocked" ? "text-rose-700" : "text-ink-700"}`}>{progress.message}</p>}
      {progress.failedPages.length > 0 && <p className="mt-1 text-[13px] text-rose-700">Pages skipped after retries: {progress.failedPages.join(", ")}. Run them again with the form below once the import has finished.</p>}
      {progress.log.length > 0 && (
        <details className="mt-3 text-[12px] text-ink-600">
          <summary className="cursor-pointer text-brand-700">Latest activity</summary>
          <ul className="mt-1 grid gap-0.5">
            {progress.log.map((e, i) => (
              <li key={i} className={e.level === "error" ? "text-rose-700" : e.level === "warn" ? "text-amber-700" : ""}>
                {e.at.slice(11, 19)} UTC · {e.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      {startForm}
    </div>
  );
}
