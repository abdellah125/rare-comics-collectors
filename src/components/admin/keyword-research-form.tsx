"use client";

import { Fragment, useActionState, useState } from "react";
import { Field, Table, Td, Th, Tone, adminButton, adminInput, adminSelect, adminTextarea } from "@/components/admin/ui";
import { researchKeywordsAction, testSemrushAction, type ConnectionTest, type ResearchOutcome } from "@/lib/admin/actions/keywords";
import type { ActionState } from "@/lib/validation";

const DATABASES: [string, string][] = [["us", "United States"], ["uk", "United Kingdom"], ["ca", "Canada"], ["au", "Australia"], ["de", "Germany"], ["fr", "France"], ["es", "Spain"], ["it", "Italy"], ["br", "Brazil"]];

const n = (v: number | null, digits = 0) => (v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));

/** Connection test (free) and the research form; results render below the form. */
export function KeywordResearchForm({ configured, defaultDatabase, seeds }: { configured: boolean; defaultDatabase: string; seeds: { phrase: string; why: string }[] }) {
  const [testState, testAction, testing] = useActionState<ActionState<ConnectionTest> | undefined, FormData>(testSemrushAction, undefined);
  const [state, formAction, pending] = useActionState<ActionState<ResearchOutcome> | undefined, FormData>(researchKeywordsAction, undefined);
  const [phrases, setPhrases] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const errors = state && !state.ok ? (state.errors ?? {}) : {};
  const data = state?.ok ? state.data : undefined;
  const addSeed = (p: string) => setPhrases((cur) => (cur.split(/\n/).map((x) => x.trim()).includes(p) ? cur : `${cur.trim()}${cur.trim() ? "\n" : ""}${p}`));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <form action={testAction}>
          <button type="submit" disabled={testing || !configured} className={adminButton.outline}>
            {testing ? "Checking…" : "Test connection (0 units)"}
          </button>
        </form>
        {testState?.message && (
          <p role={testState.ok ? "status" : "alert"} className={`rounded-lg px-3 py-1.5 text-[13px] ${testState.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-700"}`}>
            {testState.message}
          </p>
        )}
      </div>

      <form action={formAction} className="grid gap-4" aria-busy={pending}>
        <div className="grid gap-4 rounded-xl border border-ink-200 bg-white p-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Field label="Keywords (one per line, up to 50)" hint={errors.phrases ?? "Cached phrases cost nothing; new ones cost 10 units each for the overview."}>
              <textarea name="phrases" rows={8} required value={phrases} onChange={(e) => setPhrases(e.target.value)} className={`${adminTextarea} ${errors.phrases ? "border-rose-400" : ""}`} placeholder={"amazing spider-man 300 cgc\nincredible hulk 181 value"} />
            </Field>
          </div>
          <div className="grid content-start gap-3">
            <Field label="Region (Semrush database)" hint={errors.database}>
              <select name="database" defaultValue={defaultDatabase} className={adminSelect}>
                {DATABASES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="related" className="h-4 w-4" /> Related keywords (40 units per line)
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-800">
              <input type="checkbox" name="questions" className="h-4 w-4" /> Question keywords (40 units per line)
            </label>
            <Field label="Lines per phrase for related / questions" hint="5–50; the cost cap for those reports.">
              <input name="limit" type="number" min={5} max={50} defaultValue={20} className={adminInput} />
            </Field>
          </div>
        </div>
        {seeds.length > 0 && (
          <details className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-ink-900">Seed ideas from the catalogue ({seeds.length}) — click to add, nothing is fetched until you submit</summary>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {seeds.map((s) => (
                <li key={s.phrase}>
                  <button type="button" onClick={() => addSeed(s.phrase)} title={s.why} className="rounded-full border border-ink-300 bg-white px-2.5 py-0.5 text-[12px] text-ink-800 hover:bg-ink-100">
                    {s.phrase}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {state && !state.ok && state.message && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
            {state.message}
          </p>
        )}
        {state?.ok && state.message && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
            {state.message}
            {data?.warnings.map((w) => (
              <span key={w} className="block text-amber-800">
                {w}
              </span>
            ))}
          </p>
        )}
        <div>
          <button type="submit" disabled={pending || !configured} className={adminButton.primary}>
            {pending ? "Researching…" : "Research keywords"}
          </button>
        </div>
      </form>

      {data && data.results.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>Keyword</Th>
              <Th align="right">Volume / mo</Th>
              <Th align="right">KD</Th>
              <Th align="right">CPC</Th>
              <Th align="right">Competition</Th>
              <Th>Intent</Th>
              <Th>Source</Th>
              <Th>More</Th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((k) => (
              <Fragment key={k.phrase}>
                <tr>
                  <Td className="font-medium text-ink-900">{k.phrase}</Td>
                  <Td align="right">{n(k.volume)}</Td>
                  <Td align="right">{n(k.difficulty)}</Td>
                  <Td align="right">{k.cpc === null ? "—" : `$${n(k.cpc, 2)}`}</Td>
                  <Td align="right">{n(k.competition, 2)}</Td>
                  <Td className="text-[12px]">{k.intents ?? "—"}</Td>
                  <Td>{k.fromCache ? <Tone tone="neutral">cache</Tone> : <Tone tone="brand">fetched</Tone>}</Td>
                  <Td>
                    {k.related.length + k.questions.length > 0 ? (
                      <button type="button" onClick={() => setOpen(open === k.phrase ? null : k.phrase)} className="text-[12px] font-semibold text-brand-700 hover:underline">
                        {open === k.phrase ? "hide" : `${k.related.length} related · ${k.questions.length} questions`}
                      </button>
                    ) : (
                      <span className="text-[12px] text-ink-400">—</span>
                    )}
                  </Td>
                </tr>
                {open === k.phrase && (
                  <tr>
                    <td colSpan={8} className="border-b border-ink-100 bg-ink-50 px-3 py-2.5 text-[12px]">
                      {(["related", "questions"] as const).map((kind) => k[kind].length > 0 && (
                        <div key={kind} className="mb-2">
                          <p className="font-semibold uppercase tracking-wide text-ink-500">{kind}</p>
                          <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
                            {k[kind].map((r) => (
                              <li key={r.phrase} className="flex justify-between gap-3">
                                <span>{r.phrase}</span>
                                <span className="tabular-nums text-ink-600">{n(r.volume)}{r.difficulty !== null ? ` · KD ${n(r.difficulty)}` : ""}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
