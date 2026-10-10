/**
 * The job queue against the local database: success, failure, retries and backoff, permanent
 * errors, abandoned-job recovery, heartbeats and lost leases, concurrent drains, de-duplication,
 * priorities, manual retry and cancel, IndexNow outcomes and batching, the import_fix steps, and
 * the dashboard counts.
 *
 *   npx tsx --conditions=react-server tests/integration/jobs-queue.ts
 *
 * Test jobs use their own types (test_*) and every drain is limited to them, so the real jobs in
 * the local queue are never claimed. Everything created here is removed at the end. No network
 * call leaves the machine except one deliberately unauthenticated request to the AI API (which
 * is refused and costs nothing) when there are listings to look up.
 */
import { PrismaClient } from "@prisma/client";

process.loadEnvFile?.(".env");
process.env.JOBS_LEASE_MS = "15000"; // heartbeat every 5 s, so the heartbeat checks stay short

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new PrismaClient();
  const q = await import("@/lib/jobs/queue");
  const { PermanentJobError, TransientJobError } = await import("@/lib/jobs/policy");
  const { jobCounts } = await import("@/lib/jobs/dashboard");
  type T = Parameters<typeof q.registerJobHandler>[0];
  const t = (s: string) => s as T;
  const TYPES = ["test_ok", "test_flaky", "test_perm", "test_slow", "test_lost", "test_excl", "test_dedupe", "test_recurring", "test_prio_low", "test_prio_high", "test_abandon"];
  const cleanup = async () => {
    const ids = (await db.job.findMany({ where: { type: { in: [...TYPES, "retry_webhook"] }, payloadJson: { contains: "itest" } }, select: { id: true } })).map((j) => j.id);
    const own = (await db.job.findMany({ where: { type: { in: TYPES } }, select: { id: true } })).map((j) => j.id);
    const all = [...new Set([...ids, ...own])];
    await db.jobAttempt.deleteMany({ where: { jobId: { in: all } } });
    await db.job.deleteMany({ where: { id: { in: all } } });
  };
  await cleanup();
  const drain = (types: string[], limit = 50) => q.processJobs(limit, { types, budgetMs: 60_000 });
  const job = (id: string) => db.job.findUniqueOrThrow({ where: { id } });
  const attempts = (id: string) => db.jobAttempt.findMany({ where: { jobId: id }, orderBy: { attempt: "asc" } });

  // ── success ──
  q.registerJobHandler(t("test_ok"), async () => "did the thing");
  {
    const id = await q.enqueueJob(t("test_ok"), { itest: true });
    const r = await drain(["test_ok"]);
    const j = await job(id);
    const a = await attempts(id);
    check("a successful job is completed with its result", j.status === "completed" && j.result === "did the thing" && j.completedAt !== null && j.lockedBy === null && j.leaseUntil === null, `${j.status} ${j.result}`);
    check("the attempt is recorded with its duration", a.length === 1 && a[0].outcome === "succeeded" && a[0].durationMs !== null && a[0].finishedAt !== null, JSON.stringify(a.map((x) => x.outcome)));
    check("the drain reports it", r.processed === 1 && r.failed === 0 && r.stoppedBy === "empty", JSON.stringify(r));
  }

  // ── transient failure, backoff with jitter, then success ──
  let flakyCalls = 0;
  q.registerJobHandler(t("test_flaky"), async () => {
    flakyCalls += 1;
    if (flakyCalls < 3) throw new Error(`temporary outage ${flakyCalls}`);
    return "worked on the third try";
  });
  {
    const id = await q.enqueueJob(t("test_flaky"), { itest: true }, { maxAttempts: 5 });
    const before = Date.now();
    await drain(["test_flaky"]);
    let j = await job(id);
    const delay = j.runAt.getTime() - before;
    check("a transient failure is queued again with a backoff (15–30 s for the first)", j.status === "pending" && j.attempts === 1 && delay >= 14_000 && delay <= 31_000, `status=${j.status} delay=${delay}`);
    check("the error is kept with its time", (j.lastError ?? "").includes("temporary outage 1") && (j.lastError ?? "").includes("attempt 1 of 5") && j.lastErrorAt !== null, j.lastError ?? "");
    let a = await attempts(id);
    check("the failed attempt is recorded as transient with its retry time", a[0].outcome === "failed" && a[0].errorKind === "transient" && a[0].retryAt !== null, JSON.stringify(a[0]));
    await db.job.update({ where: { id }, data: { runAt: new Date() } });
    await drain(["test_flaky"]);
    j = await job(id);
    const delay2 = j.runAt.getTime() - Date.now();
    check("the second delay is longer (30–60 s)", j.status === "pending" && j.attempts === 2 && delay2 >= 28_000 && delay2 <= 61_000, `delay=${delay2}`);
    await db.job.update({ where: { id }, data: { runAt: new Date() } });
    await drain(["test_flaky"]);
    j = await job(id);
    a = await attempts(id);
    check("it completes once the handler succeeds; history is kept", j.status === "completed" && j.attempts === 3 && a.length === 3 && a.map((x) => x.outcome).join() === "failed,failed,succeeded" && (j.lastError ?? "").includes("outage 2"), a.map((x) => x.outcome).join());
  }

  // ── permanent errors and exhaustion ──
  q.registerJobHandler(t("test_perm"), async (p) => {
    if (p.mode === "permanent") throw new PermanentJobError("the record no longer exists");
    throw new TransientJobError("still down");
  });
  {
    const id = await q.enqueueJob(t("test_perm"), { itest: true, mode: "permanent" }, { maxAttempts: 5 });
    await drain(["test_perm"]);
    const j = await job(id);
    check("a permanent error fails at once, without retries", j.status === "failed" && j.attempts === 1 && (j.lastError ?? "").includes("permanent error, not retried"), j.lastError ?? "");
    const id2 = await q.enqueueJob(t("test_perm"), { itest: true, mode: "transient" }, { maxAttempts: 2 });
    await drain(["test_perm"]);
    await db.job.update({ where: { id: id2 }, data: { runAt: new Date() } });
    await drain(["test_perm"]);
    const j2 = await job(id2);
    check("after its last attempt a job is failed, never retried endlessly", j2.status === "failed" && j2.attempts === 2 && (j2.lastError ?? "").includes("no attempts left"), j2.lastError ?? "");
    const bad = await db.job.create({ data: { type: "test_ok", payloadJson: "{not json", runAt: new Date() } });
    await drain(["test_ok"]);
    const j3 = await job(bad.id);
    check("a corrupt payload fails permanently instead of running with {}", j3.status === "failed" && (j3.lastError ?? "").includes("not a valid JSON object"), j3.lastError ?? "");

    // Manual retry keeps the history and grants new attempts.
    const r = await q.retryJob(id2);
    const j4 = await job(id2);
    check("manual retry keeps attempts and the last error, and grants more attempts", r.ok && j4.status === "pending" && j4.attempts === 2 && j4.maxAttempts > 2 && (j4.lastError ?? "").includes("still down") && (await attempts(id2)).length === 2, `${r.message} max=${j4.maxAttempts}`);
    const c = await q.cancelJob(id2);
    check("a waiting job can be cancelled", c.ok && (await job(id2)).status === "cancelled", c.message);
    const done = await db.job.findFirstOrThrow({ where: { type: "test_ok", status: "completed" } });
    check("a completed job cannot be cancelled or retried", !(await q.cancelJob(done.id)).ok && !(await q.retryJob(done.id)).ok);
  }

  // ── abandoned jobs (worker gone) and live jobs ──
  q.registerJobHandler(t("test_abandon"), async () => "recovered and finished");
  {
    const past = new Date(Date.now() - 60_000);
    const dead = await db.job.create({ data: { type: "test_abandon", payloadJson: '{"itest":1}', status: "running", attempts: 1, maxAttempts: 3, lockedAt: new Date(Date.now() - 120_000), startedAt: new Date(Date.now() - 120_000), heartbeatAt: new Date(Date.now() - 100_000), leaseUntil: past, lockedBy: "dead-worker" } });
    await db.jobAttempt.create({ data: { jobId: dead.id, type: "test_abandon", attempt: 1, worker: "dead-worker", startedAt: new Date(Date.now() - 120_000) } });
    const live = await db.job.create({ data: { type: "test_abandon", payloadJson: '{"itest":2}', status: "running", attempts: 1, maxAttempts: 3, lockedAt: new Date(), startedAt: new Date(), heartbeatAt: new Date(), leaseUntil: new Date(Date.now() + 60_000), lockedBy: "live-worker" } });
    const spent = await db.job.create({ data: { type: "test_abandon", payloadJson: '{"itest":3}', status: "running", attempts: 3, maxAttempts: 3, lockedAt: past, leaseUntil: past, lockedBy: "dead-worker" } });
    const legacy = await db.job.create({ data: { type: "test_abandon", payloadJson: '{"itest":4}', status: "running", attempts: 1, maxAttempts: 3, lockedAt: new Date(Date.now() - 10 * 60_000) } });

    const counts = await jobCounts();
    check("the dashboard counts abandoned jobs", counts.abandoned >= 3, `abandoned=${counts.abandoned}`);
    check("a live job cannot be retried or cancelled", !(await q.retryJob(live.id)).ok && !(await q.cancelJob(live.id)).ok);
    const n = await q.recoverAbandonedJobs(new Date(), { types: ["test_abandon"] });
    const [d, l, s, g] = await Promise.all([job(dead.id), job(live.id), job(spent.id), job(legacy.id)]);
    const da = await attempts(dead.id);
    check("only jobs whose lease lapsed are recovered", n === 3 && l.status === "running" && l.lockedBy === "live-worker", `recovered=${n} live=${l.status}`);
    check("an abandoned job goes back to the queue with a delay and a reason", d.status === "pending" && d.runAt > new Date() && (d.lastError ?? "").includes("dead-worker") && (d.lastError ?? "").includes("stopped reporting"), d.lastError ?? "");
    check("its attempt is recorded as abandoned (lease expired)", da.length === 1 && da[0].outcome === "abandoned" && da[0].errorKind === "lease_expired", JSON.stringify(da.map((x) => x.outcome)));
    check("an abandoned job with no attempts left is failed", s.status === "failed" && (s.lastError ?? "").includes("No attempts left"), s.lastError ?? "");
    check("a row from before leases (lock older than 3 min) is recovered too", g.status === "pending", g.status);
    check("recovering again changes nothing", (await q.recoverAbandonedJobs(new Date(), { types: ["test_abandon"] })) === 0);
    await db.job.update({ where: { id: dead.id }, data: { runAt: new Date() } });
    await drain(["test_abandon"]);
    check("while another copy of the same type runs live, the recovered job waits (one at a time)", (await job(dead.id)).status === "pending");
    await db.job.update({ where: { id: live.id }, data: { status: "cancelled", leaseUntil: null, lockedBy: null } });
    await drain(["test_abandon"]);
    check("the recovered job then runs normally", (await job(dead.id)).status === "completed", (await job(dead.id)).status);
  }

  // ── heartbeat keeps a long job's lease; a lost lease never overwrites the new owner ──
  q.registerJobHandler(t("test_slow"), async () => {
    await sleep(6_500);
    return "slow but fine";
  });
  let sawAbort = false;
  q.registerJobHandler(t("test_lost"), async (_p, ctx) => {
    await db.job.update({ where: { id: ctx.jobId }, data: { lockedBy: "another-worker" } }); // as if recovered and claimed elsewhere
    for (let i = 0; i < 80 && !ctx.signal.aborted; i++) await sleep(100);
    sawAbort = ctx.signal.aborted;
    return "should not be recorded";
  });
  {
    const id = await q.enqueueJob(t("test_slow"), { itest: true });
    const run = drain(["test_slow"]);
    await sleep(6_000);
    const mid = await job(id);
    check("the heartbeat renews the lease while the handler runs", mid.status === "running" && mid.heartbeatAt !== null && mid.startedAt !== null && mid.heartbeatAt > mid.startedAt && mid.leaseUntil! > new Date(), `hb=${mid.heartbeatAt?.toISOString()} start=${mid.startedAt?.toISOString()}`);
    await run;
    check("the long job completes", (await job(id)).status === "completed");

    const lostId = await q.enqueueJob(t("test_lost"), { itest: true });
    const r = await drain(["test_lost"]);
    const lj = await job(lostId);
    const la = await attempts(lostId);
    check("a worker that lost the lease is told (signal aborted)", sawAbort);
    check("its late result is not written over the new owner", lj.status === "running" && lj.lockedBy === "another-worker" && lj.result === null && la[0]?.outcome === "lost_lease" && r.lostLease === 1, `${lj.status} ${lj.lockedBy} ${la[0]?.outcome}`);
    await db.job.update({ where: { id: lostId }, data: { status: "cancelled", lockedBy: null, leaseUntil: null } });
  }

  // ── concurrent drains: each job once; exclusive types one at a time ──
  {
    const realWebhooks = await db.job.count({ where: { type: "retry_webhook", status: "pending" } });
    if (realWebhooks === 0) {
      const runs = new Map<string, number>();
      q.registerJobHandler("retry_webhook", async (_p, ctx) => {
        runs.set(ctx.jobId, (runs.get(ctx.jobId) ?? 0) + 1);
        await sleep(20);
      });
      const ids = await Promise.all(Array.from({ length: 30 }, (_, i) => q.enqueueJob("retry_webhook", { itest: i })));
      await Promise.all([1, 2, 3, 4].map(() => drain(["retry_webhook"], 30)));
      const twice = [...runs.values()].filter((n) => n > 1).length;
      const done = await db.job.count({ where: { id: { in: ids }, status: "completed" } });
      check("four concurrent drains run each of 30 jobs exactly once", runs.size === 30 && twice === 0 && done === 30, `ran=${runs.size} twice=${twice} completed=${done}`);
    } else check("(skipped: real retry_webhook jobs are waiting locally)", true);

    let active = 0;
    let peak = 0;
    q.registerJobHandler(t("test_excl"), async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(300);
      active -= 1;
    });
    for (let i = 0; i < 4; i++) await db.job.create({ data: { type: "test_excl", payloadJson: JSON.stringify({ itest: i }) } });
    await Promise.all([1, 2, 3, 4].map(() => drain(["test_excl"], 4)));
    for (let i = 0; i < 4 && (await db.job.count({ where: { type: "test_excl", status: "pending" } })) > 0; i++) await drain(["test_excl"], 4);
    check("an exclusive job type never runs twice at the same time", peak === 1 && (await db.job.count({ where: { type: "test_excl", status: "completed" } })) === 4, `peak=${peak}`);
  }

  // ── de-duplication ──
  {
    const ids = await Promise.all(Array.from({ length: 10 }, () => q.enqueueJob(t("test_dedupe"), { itest: true }, { dedupe: true, runAt: new Date(Date.now() + 3_600_000) })));
    const waiting = await db.job.count({ where: { type: "test_dedupe", status: "pending" } });
    check("ten simultaneous de-duplicated enqueues add one job", waiting === 1 && new Set(ids).size === 1, `waiting=${waiting}`);
  }

  // ── a recurring job that fails after queuing its next run is not doubled ──
  q.registerJobHandler(t("test_recurring"), async () => {
    await q.enqueueJob(t("test_recurring"), { itest: true }, { dedupe: true, runAt: new Date(Date.now() + 3_600_000) });
    throw new Error("failed after scheduling the next run");
  });
  {
    const id = await q.enqueueJob(t("test_recurring"), { itest: true }, { dedupe: true });
    await drain(["test_recurring"], 1);
    const rows = await db.job.findMany({ where: { type: "test_recurring" }, orderBy: { createdAt: "asc" } });
    const waiting = rows.filter((r) => r.status === "pending");
    check("the failed run is folded into the already queued next run", waiting.length === 1 && rows.find((r) => r.id === id)?.status === "failed" && waiting[0].runAt.getTime() < Date.now() + 120_000, `pending=${waiting.length} next in ${Math.round((waiting[0]?.runAt.getTime() - Date.now()) / 1000)} s`);
    check("…and the failure says so", (rows.find((r) => r.id === id)?.lastError ?? "").includes("not retried on its own"));
  }

  // ── priorities ──
  {
    const order: string[] = [];
    q.registerJobHandler(t("test_prio_low"), async () => void order.push("low"));
    q.registerJobHandler(t("test_prio_high"), async () => void order.push("high"));
    await q.enqueueJob(t("test_prio_low"), { itest: true }, { priority: -10, runAt: new Date(Date.now() - 60_000) });
    await q.enqueueJob(t("test_prio_high"), { itest: true }, { priority: 50 });
    await drain(["test_prio_low", "test_prio_high"]);
    check("an urgent job runs before older bulk work", order.join() === "high,low", order.join());
    await q.enqueueJob(t("test_prio_low"), { itest: true }, { priority: -10, runAt: new Date(Date.now() - 8 * 3_600_000) });
    await q.enqueueJob(t("test_prio_high"), { itest: true }, { priority: 10 });
    order.length = 0;
    await drain(["test_prio_low", "test_prio_high"]);
    check("bulk work that has waited for hours is not starved", order.join() === "low,high", order.join());
  }

  // ── IndexNow: outcomes, batching, coalescing ──
  {
    const { indexNowJobOutcome, pingIndexNow, submitIndexNow, INDEXNOW_OPEN_BATCH, pathsOf } = await import("@/lib/indexnow");
    const { runIndexNowPing } = await import("@/lib/jobs/indexnow-ping");
    const base = { keyLocation: "https://x/k.txt", urls: ["https://x/a"], rejected: [] as string[], submitted: 0 };
    const kind = (r: Parameters<typeof indexNowJobOutcome>[0]) => {
      try {
        return `ok:${indexNowJobOutcome(r)}`;
      } catch (e) {
        return e instanceof PermanentJobError ? "permanent" : e instanceof TransientJobError ? `transient:${e.retryAfterMs ?? 0}` : "other";
      }
    };
    check("IndexNow 200 completes with an honest summary", kind({ ...base, ok: true, status: 200, submitted: 1 }) === "ok:IndexNow 200: 1 URL(s) accepted");
    check("IndexNow 202 is reported as received, not as indexed", kind({ ...base, ok: true, status: 202, submitted: 1 }).includes("received (key validation pending)"));
    check("IndexNow 429 is retried no sooner than 10 min", kind({ ...base, ok: false, status: 429, retryAfterMs: 60_000 }) === "transient:600000");
    check("IndexNow 503 and network errors are retried", kind({ ...base, ok: false, status: 503 }).startsWith("transient") && kind({ ...base, ok: false, status: 0, error: "ETIMEDOUT" }).startsWith("transient"));
    check("IndexNow 403/422 are permanent (key or scope problem)", kind({ ...base, ok: false, status: 403 }) === "permanent" && kind({ ...base, ok: false, status: 422 }) === "permanent");

    // submitIndexNow against a stand-in endpoint: absolute canonical URLs, Retry-After read.
    const realFetch = globalThis.fetch;
    const sent: { urlList: string[] }[] = [];
    let answer = 200;
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return new Response("", { status: answer, headers: answer === 429 ? { "retry-after": "120" } : {} });
    }) as unknown as typeof fetch;
    process.env.INDEXNOW_ENABLED = "true";
    try {
      const r = await submitIndexNow(["/store", "/store", "https://elsewhere.test/x"]);
      check("submissions use absolute canonical URLs, de-duplicated; foreign ones are reported", r.ok && sent[0].urlList.length === 1 && /^https?:\/\/[^/]+\/store$/.test(sent[0].urlList[0]) && r.rejected[0] === "https://elsewhere.test/x", JSON.stringify(sent[0].urlList));
      const many = Array.from({ length: 10_050 }, (_, i) => `/p/${i}`);
      sent.length = 0;
      const big = await submitIndexNow(many);
      check("more than 10,000 URLs go in several requests", big.ok && sent.length === 2 && sent[0].urlList.length === 10_000 && sent[1].urlList.length === 50 && big.submitted === 10_050, `requests=${sent.length}`);
      answer = 429;
      const limited = await submitIndexNow(["/a"]);
      check("a rate-limit answer carries Retry-After", !limited.ok && limited.status === 429 && limited.retryAfterMs === 120_000);

      // Coalescing: several saves become one waiting batch.
      await db.job.updateMany({ where: { type: "indexnow_ping", status: "pending", dedupeKey: INDEXNOW_OPEN_BATCH }, data: { dedupeKey: null } }); // seal any local open batch
      const before = await db.job.count({ where: { type: "indexnow_ping", status: "pending" } });
      await Promise.all([pingIndexNow(["/itest/a", "/store"]), pingIndexNow(["/itest/b", "/store"]), pingIndexNow(["/itest/c"])]);
      const open = await db.job.findMany({ where: { type: "indexnow_ping", status: "pending", dedupeKey: INDEXNOW_OPEN_BATCH } });
      check("three pings in a burst become one batch with every path once", open.length === 1 && (await db.job.count({ where: { type: "indexnow_ping", status: "pending" } })) === before + 1 && pathsOf(open[0].payloadJson).sort().join() === "/itest/a,/itest/b,/itest/c,/store", pathsOf(open[0]?.payloadJson ?? "{}").join());

      // Running a ping submits the other waiting pings with it; a refusal leaves them waiting.
      const other = await db.job.create({ data: { type: "indexnow_ping", payloadJson: JSON.stringify({ paths: ["/itest/legacy"] }) } });
      answer = 503;
      sent.length = 0;
      let threw = false;
      try {
        await runIndexNowPing({ paths: ["/itest/own"] }, { jobId: open[0].id });
      } catch {
        threw = true;
      }
      check("a refused submission leaves the other waiting pings untouched", threw && (await job(other.id)).status === "pending");
      answer = 200;
      sent.length = 0;
      const summary = await runIndexNowPing({ paths: ["/itest/own"] }, { jobId: open[0].id });
      const o = await job(other.id);
      check("an accepted submission completes the pings it carried", o.status === "completed" && (o.result ?? "").includes(open[0].id) && sent[0].urlList.some((u) => u.endsWith("/itest/legacy")) && summary.includes("together with"), summary);
      await db.job.deleteMany({ where: { id: { in: [other.id] } } });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.INDEXNOW_ENABLED;
    }
    // Put back the local pings this test touched: its own batch goes, the others stay as they were.
    await db.job.deleteMany({ where: { type: "indexnow_ping", payloadJson: { contains: "/itest/" } } });
  }

  // ── import_fix: step order, merging of two passes, cursor resume, knowledge phase ──
  {
    const { compareImportFixSteps, queueImportFixStep, runImportFix } = await import("@/lib/jobs/import-fix");
    check("steps are ordered start < cursors (by id) < knowledge", compareImportFixSteps({}, { cursor: "a" }) < 0 && compareImportFixSteps({ cursor: "a" }, { cursor: "b" }) < 0 && compareImportFixSteps({ cursor: "z" }, { phase: "knowledge" }) < 0);
    const realFix = await db.job.findMany({ where: { type: "import_fix", status: "pending" } });
    // Park the real waiting steps (if any) so the test sees only its own; restored below.
    await db.job.updateMany({ where: { id: { in: realFix.map((j) => j.id) } }, data: { status: "cancelled" } });
    try {
      await queueImportFixStep({ phase: "knowledge" }, new Date(Date.now() + 3_600_000));
      await queueImportFixStep({ cursor: "itest-m" });
      await queueImportFixStep({ cursor: "itest-z" });
      const waiting = await db.job.findMany({ where: { type: "import_fix", status: "pending" } });
      check("two passes become one, resuming at the earlier position", waiting.length === 1 && JSON.parse(waiting[0].payloadJson).cursor === "itest-m", waiting.map((w) => w.payloadJson).join(" | "));
      await db.job.deleteMany({ where: { id: { in: waiting.map((w) => w.id) } } });

      const { IMPORT_SOURCE } = await import("@/lib/imports/status");
      const errs = await db.importItem.findMany({ where: { source: IMPORT_SOURCE, status: "error", reviewedAt: null, editedJson: "[]" }, orderBy: { id: "asc" }, select: { id: true, updatedAt: true } });
      if (errs.length >= 3) {
        const cursor = errs[errs.length - 3].id;
        const summary = await runImportFix({ cursor });
        const next = await db.job.findMany({ where: { type: "import_fix", status: "pending" } });
        check("a cursor step resumes after its cursor and only there", summary.includes(`after ${cursor}: 2 checked`), summary);
        check("the last batch hands over to the knowledge phase", next.length === 1 && JSON.parse(next[0].payloadJson).phase === "knowledge", next.map((n) => n.payloadJson).join());
        await db.job.deleteMany({ where: { id: { in: next.map((n) => n.id) } } });
      } else check("(cursor resume skipped: fewer than 3 import items in Error locally)", true);

      let bad = "";
      try {
        await runImportFix({ phase: "nonsense" });
      } catch (e) {
        bad = e instanceof PermanentJobError ? "permanent" : "other";
      }
      check("an unknown import_fix phase is a permanent error", bad === "permanent");

      // Knowledge phase with an AI key that is refused: nothing is marked as tried, and the queue is told to retry.
      const where = { source: IMPORT_SOURCE, status: "pending_review", reviewedAt: null, editedJson: "[]", knowledgeTriedAt: null, OR: [{ year: null }, { publisher: "Unknown" }] };
      const untried = await db.importItem.count({ where });
      const key = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "itest-invalid-key";
      try {
        let outcome = "";
        try {
          outcome = `ok:${await runImportFix({ phase: "knowledge" })}`;
        } catch (e) {
          outcome = e instanceof TransientJobError ? "transient" : `other:${String(e)}`;
        }
        if (untried > 0) check("knowledge phase: an unavailable AI service is a transient error and marks nothing as tried", outcome === "transient" && (await db.importItem.count({ where })) === untried, `${outcome} untried ${untried}→${await db.importItem.count({ where })}`);
        else check("knowledge phase with nothing to look up finishes", outcome.startsWith("ok:Knowledge phase finished"), outcome);
      } finally {
        process.env.ANTHROPIC_API_KEY = key;
      }
    } finally {
      await db.job.deleteMany({ where: { type: "import_fix", status: "pending", createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, id: { notIn: realFix.map((j) => j.id) } } });
      await db.job.updateMany({ where: { id: { in: realFix.map((j) => j.id) } }, data: { status: "pending" } });
    }
  }

  // ── dashboard counts match the table ──
  {
    const c = await jobCounts();
    const by = await db.job.groupBy({ by: ["status"], _count: { _all: true } });
    const n = (s: string) => by.find((b) => b.status === s)?._count._all ?? 0;
    check("dashboard counts add up", c.total === by.reduce((a, b) => a + b._count._all, 0) && c.pending === n("pending") && c.failed === n("failed") && c.failedUnresolved <= c.failed && c.retrying <= c.pending && c.due <= c.pending, JSON.stringify(c));
  }

  await cleanup();
  await db.$disconnect();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
