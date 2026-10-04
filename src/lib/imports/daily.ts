/** The daily release rule's arithmetic. Pure. */

/** Start of the current day in UTC: the rule counts releases per UTC day. */
export const utcDayStart = (now: Date = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/**
 * How many products one run may release and how many more it should move into preparation.
 * `perDay` 0 switches the rule off. A run never releases more than `batch`, so each run stays short.
 */
export function dailyPlan(input: { perDay: number; releasedToday: number; ready: number; inPreparation: number; batch: number }): { release: number; approve: number; remaining: number } {
  const remaining = Math.max(0, Math.floor(input.perDay) - input.releasedToday);
  if (remaining === 0) return { release: 0, approve: 0, remaining: 0 };
  const release = Math.min(remaining, input.ready, input.batch);
  // Keep enough approved products in the pipeline to fill what is left of today, and no more.
  const approve = Math.max(0, Math.min(remaining - input.ready - input.inPreparation, input.batch * 2));
  return { release, approve, remaining };
}
