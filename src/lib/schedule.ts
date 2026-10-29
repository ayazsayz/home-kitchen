import type { Settings, TimeRange, WeeklyHours } from "./types";

import { DEFAULT_TZ, addDays, zoned, zonedInstant } from "./tz";

/**
 * Opening hours and time slots, in the shop's time zone (settings.timezone).
 * Works the same on the server and in the browser, including zones with daylight saving.
 */
const DAY = 24 * 60;
type TzSettings = { timezone?: string };
const tzOf = (s: TzSettings | undefined) => s?.timezone || DEFAULT_TZ;
const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

/** A day's ranges as [startMin, endMin) relative to that day's midnight; overnight ranges end after 1440. */
function dayRanges(hours: WeeklyHours, dow: number): [number, number][] {
  return (hours[String(dow)] ?? [])
    .map((r: TimeRange) => {
      const o = toMinutes(r.open);
      let c = toMinutes(r.close);
      if (o == null || c == null) return null;
      if (c <= o) c += DAY; // past midnight (or 24h if equal)
      return [o, c] as [number, number];
    })
    .filter((x): x is [number, number] => x !== null);
}

export function hasHours(hours: WeeklyHours | undefined) {
  return !!hours && [0, 1, 2, 3, 4, 5, 6].some((d) => dayRanges(hours, d).length > 0);
}

/** Absolute open intervals overlapping [from, from + days]. */
function intervals(hours: WeeklyHours, from: Date, days: number, tz: string): [Date, Date][] {
  const start = zoned(from, tz).ymd;
  const out: [Date, Date][] = [];
  for (let i = -1; i <= days; i++) {
    const ymd = addDays(start, i);
    for (const [o, c] of dayRanges(hours, dowOf(ymd))) out.push([zonedInstant(ymd, o, tz), zonedInstant(ymd, c, tz)]);
  }
  return out.sort((a, b) => +a[0] - +b[0]);
}

export function withinHours(hours: WeeklyHours, at: Date, tz = DEFAULT_TZ) {
  return intervals(hours, at, 0, tz).some(([a, b]) => at >= a && at < b);
}

/** Open right now for immediate (ASAP) orders? `is_open` is the master switch. */
export function isOpenNow(s: Pick<Settings, "is_open" | "auto_hours" | "hours"> & TzSettings, now = new Date()) {
  if (!s.is_open) return false;
  if (!s.auto_hours || !hasHours(s.hours)) return true;
  return withinHours(s.hours, now, tzOf(s));
}

/** Next time the kitchen opens (from the weekly hours), or null. */
export function nextOpening(s: Pick<Settings, "hours"> & TzSettings, now = new Date()): Date | null {
  if (!hasHours(s.hours)) return null;
  const next = intervals(s.hours, now, 7, tzOf(s)).find(([a, b]) => a > now || (now >= a && now < b));
  if (!next) return null;
  return next[0] > now ? next[0] : now;
}

export type Slot = {
  start: string; // ISO instant
  day: string; // "Today", "Tomorrow", "Thu 30 Oct"
  time: string; // "7:30 PM"
  full: boolean;
};

export const fmtTime = (d: Date, tz = DEFAULT_TZ) => d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
export function fmtDay(d: Date, tz = DEFAULT_TZ, now = new Date()) {
  const a = zoned(d, tz).ymd;
  const today = zoned(now, tz).ymd;
  if (a === today) return "Today";
  if (a === addDays(today, 1)) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
}
/** "Today, 7:30 PM" in the shop's time zone. */
export const fmtWhen = (iso: string, tz = DEFAULT_TZ, now = new Date()) =>
  `${fmtDay(new Date(iso), tz, now)}, ${fmtTime(new Date(iso), tz)}`;

/**
 * Bookable delivery/pickup slots (labels in the shop's time zone). A slot is offered if it starts at least `lead_minutes`
 * from now, inside opening hours, within `days_ahead` days. `taken` maps slot ISO → orders already booked.
 */
export function buildSlots(
  s: Pick<Settings, "is_open" | "hours" | "allow_scheduled" | "slot_minutes" | "slot_capacity" | "lead_minutes" | "days_ahead"> & TzSettings,
  taken: Record<string, number> = {},
  now = new Date(),
): Slot[] {
  if (!s.is_open || !s.allow_scheduled || !hasHours(s.hours)) return [];
  const tz = tzOf(s);
  const step = Math.max(10, s.slot_minutes || 30) * 60000;
  const earliest = now.getTime() + Math.max(0, s.lead_minutes) * 60000;
  const lastDay = addDays(zoned(now, tz).ymd, Math.max(0, s.days_ahead));
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const [a, b] of intervals(s.hours, now, s.days_ahead + 1, tz)) {
    for (let t = a.getTime(); t < b.getTime(); t += step) {
      if (t < earliest) continue;
      const d = new Date(t);
      if (zoned(d, tz).ymd > lastDay) continue;
      const iso = d.toISOString();
      if (seen.has(iso)) continue;
      seen.add(iso);
      slots.push({
        start: iso,
        day: fmtDay(d, tz, now),
        time: fmtTime(d, tz),
        full: s.slot_capacity > 0 && (taken[iso] ?? 0) >= s.slot_capacity,
      });
    }
  }
  return slots.sort((x, y) => x.start.localeCompare(y.start));
}

/** Normalises any timestamp string to the ISO form used as slot keys. */
export const slotKey = (ts: string) => new Date(ts).toISOString();

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
