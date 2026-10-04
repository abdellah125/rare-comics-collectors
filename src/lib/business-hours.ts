import { msg } from "@/lib/i18n/translate";
import { site } from "@/lib/site";

const DAYS = [msg("Sunday"), msg("Monday"), msg("Tuesday"), msg("Wednesday"), msg("Thursday"), msg("Friday"), msg("Saturday")] as const;
type Day = (typeof DAYS)[number];

export type BusinessStatus =
  | { open: true; closes: string }
  /** `day` is null when the store reopens later today. */
  | { open: false; opens: string; day: Day | null };

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "19:00" → "7:00 PM". */
export function clock(hhmm: string): string {
  const [h, m] = [Number(hhmm.slice(0, 2)), hhmm.slice(3, 5)];
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Whether the store is open right now, in the store's own time zone, and when that changes. */
export function businessStatus(now: Date = new Date()): BusinessStatus {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: site.timeZone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const today = DAYS.indexOf(get("weekday") as Day);
  const minute = Number(get("hour")) * 60 + Number(get("minute"));
  const hoursFor = (day: Day) => site.openingHours.find((h) => (h.days as readonly string[]).includes(day));

  const todays = hoursFor(DAYS[today]);
  if (todays && minute >= minutes(todays.opens) && minute < minutes(todays.closes)) return { open: true, closes: clock(todays.closes) };
  if (todays && minute < minutes(todays.opens)) return { open: false, opens: clock(todays.opens), day: null };
  for (let i = 1; i <= 7; i++) {
    const day = DAYS[(today + i) % 7];
    const next = hoursFor(day);
    if (next) return { open: false, opens: clock(next.opens), day };
  }
  return { open: false, opens: "", day: null };
}
