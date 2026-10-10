import "server-only";
import { db } from "@/lib/db";
import { PermanentJobError, TransientJobError } from "@/lib/jobs/policy";
import { enqueueJob } from "@/lib/jobs/queue";

/**
 * The import_fix job. Steps: {} (photo errors back into preparation, then the first batch) →
 * {cursor} batches of 300 in id order → {phase:"knowledge"} batches of 25 → done. Each step is
 * complete in itself and queues the next; a retried step repeats only its own batch. Items an
 * admin has reviewed or edited — before or during the run — are never touched.
 */
export async function runImportFix(payload: Record<string, unknown>): Promise<string> {
  const { reprocessErrors, retryPhotoErrors, enrichUnknown } = await import("@/lib/imports/pipeline");
  const { IMPORT_SOURCE } = await import("@/lib/imports/status");
  if (payload.cursor !== undefined && typeof payload.cursor !== "string") throw new PermanentJobError(`import_fix: the cursor ${JSON.stringify(payload.cursor)} is not an item id.`);
  if (payload.phase !== undefined && payload.phase !== "knowledge") throw new PermanentJobError(`import_fix: unknown phase ${JSON.stringify(payload.phase)}.`);
  const cursor = typeof payload.cursor === "string" ? payload.cursor : null;

  // Second phase: details still Unknown are looked up from reference knowledge, a small batch at a time.
  if (payload.phase === "knowledge") {
    const done = await enrichUnknown(IMPORT_SOURCE, 25);
    // The AI service could not be asked (no credit, outage): nothing was marked as tried. Retried later; after the last attempt it shows as failed.
    if (done.unavailable) throw new TransientJobError(`Knowledge lookup: the AI service could not be asked; ${done.remaining} listing(s) still to look up. None was marked as tried.`, 15 * 60_000);
    if (done.asked > 0 && done.remaining > 0) {
      await queueImportFixStep({ phase: "knowledge" });
      return `Knowledge: ${done.asked} looked up, ${done.filled} filled, ${done.remaining} left`;
    }
    return `Knowledge phase finished: ${done.asked} looked up, ${done.filled} filled${done.notConfigured ? " (no AI key configured: skipped)" : ""}`;
  }

  // Photos that failed only because the host had no disk: back into preparation.
  const photos = cursor ? 0 : await retryPhotoErrors(IMPORT_SOURCE);
  let result: Awaited<ReturnType<typeof reprocessErrors>>;
  try {
    result = await reprocessErrors(IMPORT_SOURCE, { cursor, limit: 300 });
  } catch (err) {
    throw new Error(`import_fix batch after ${cursor ?? "the first item"}: ${err instanceof Error ? err.message : String(err)}`);
  }
  await queueImportFixStep(result.nextCursor ? { cursor: result.nextCursor } : { phase: "knowledge" });
  return `Batch after ${cursor ?? "the first item"}: ${result.checked} checked, ${result.fixed} fixed, ${result.duplicates} duplicate(s), ${result.still} still in Error${result.skipped ? `, ${result.skipped} left alone (changed meanwhile)` : ""}${photos ? `; ${photos} photo error(s) back into preparation` : ""}`;
}

/** One step of the import_fix pass: {} starts it, {cursor} continues after that item id, {phase:"knowledge"} is the second phase. */
export type ImportFixStep = { cursor?: string; phase?: "knowledge" };

/** Order of the steps: the start, then cursors in id order, then the knowledge phase. An earlier step covers everything after it. */
export function compareImportFixSteps(a: ImportFixStep, b: ImportFixStep): number {
  const rank = (s: ImportFixStep): [number, string] => (s.phase === "knowledge" ? [2, ""] : s.cursor ? [1, s.cursor] : [0, ""]);
  const [ra, ca] = rank(a);
  const [rb, cb] = rank(b);
  return ra !== rb ? ra - rb : ca < cb ? -1 : ca > cb ? 1 : 0;
}

function parseStep(payloadJson: string): ImportFixStep {
  try {
    const p = JSON.parse(payloadJson) as Record<string, unknown>;
    return { ...(typeof p.cursor === "string" ? { cursor: p.cursor } : {}), ...(p.phase === "knowledge" ? { phase: "knowledge" as const } : {}) };
  } catch {
    return {};
  }
}

/**
 * Queues the next step of the pass. When a step is already waiting (a second pass was started,
 * e.g. by an earlier deploy), the two become one pass that resumes at the earlier position, so no
 * batch is skipped and none is worked on by two passes at once.
 */
export async function queueImportFixStep(next: ImportFixStep, runAt = new Date(Date.now() + 2_000)): Promise<string> {
  const waiting = await db.job.findFirst({ where: { type: "import_fix", status: "pending" }, orderBy: { createdAt: "asc" }, select: { id: true, payloadJson: true } });
  if (!waiting) return enqueueJob("import_fix", next, { runAt, maxAttempts: 3, dedupeKey: "import_fix" });
  if (compareImportFixSteps(next, parseStep(waiting.payloadJson)) < 0) {
    await db.job.updateMany({ where: { id: waiting.id, status: "pending", payloadJson: waiting.payloadJson }, data: { payloadJson: JSON.stringify(next) } });
  }
  return waiting.id;
}
