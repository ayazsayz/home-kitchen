import type { Settings, TimeRange, WeeklyHours } from "./types";

/**
 * Opening hours and time slots. All times are Dubai time (UTC+4, no daylight saving),
 * so plain offset arithmetic is exact and works the same on the server and in the browser.
 */
const OFFSET_MIN = 4 * 60;
const DAY = 24 * 60;
const TZ = "Asia/Dubai";

type Clock = { ymd: string; dow: number; minutes: number };

/** Dubai calendar day, weekday and minutes-past-midnight for an instant. */
export function dubaiClock(d: Date): Clock {
  const local = new Date(d.getTime() + OFFSET_MIN * 60000);
  return {
    ymd: local.toISOString().slice(0, 10),
    dow: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** The instant for a Dubai calendar day + minutes past its midnight (minutes may exceed 1440). */
export function dubaiInstant(ymd: string, minutes: number): Date {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + (minutes - OFFSET_MIN) * 60000);
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY * 60000).toISOString().slice(0, 10);
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
function intervals(hours: WeeklyHours, from: Date, days: number): [Date, Date][] {
  const start = dubaiClock(from).ymd;
  const out: [Date, Date][] = [];
  for (let i = -1; i <= days; i++) {
    const ymd = addDays(start, i);
    for (const [o, c] of dayRanges(hours, dowOf(ymd))) out.push([dubaiInstant(ymd, o), dubaiInstant(ymd, c)]);
  }
  return out.sort((a, b) => +a[0] - +b[0]);
}

export function withinHours(hours: WeeklyHours, at: Date) {
  return intervals(hours, at, 0).some(([a, b]) => at >= a && at < b);
}

/** Open right now for immediate (ASAP) orders? `is_open` is the master switch. */
export function isOpenNow(s: Pick<Settings, "is_open" | "auto_hours" | "hours">, now = new Date()) {
  if (!s.is_open) return false;
  if (!s.auto_hours || !hasHours(s.hours)) return true;
  return withinHours(s.hours, now);
}

/** Next time the kitchen opens (from the weekly hours), or null. */
export function nextOpening(s: Pick<Settings, "hours">, now = new Date()): Date | null {
  if (!hasHours(s.hours)) return null;
  const next = intervals(s.hours, now, 7).find(([a, b]) => a > now || (now >= a && now < b));
  if (!next) return null;
  return next[0] > now ? next[0] : now;
}

export type Slot = {
  start: string; // ISO instant
  day: string; // "Today", "Tomorrow", "Thu 30 Oct"
  time: string; // "7:30 PM"
  full: boolean;
};

export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export function fmtDay(d: Date, now = new Date()) {
  const a = dubaiClock(d).ymd;
  const today = dubaiClock(now).ymd;
  if (a === today) return "Today";
  if (a === addDays(today, 1)) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}
export const fmtWhen = (iso: string, now = new Date()) => `${fmtDay(new Date(iso), now)}, ${fmtTime(new Date(iso))}`;

/**
 * Bookable delivery/pickup slots. A slot is offered if it starts at least `lead_minutes`
 * from now, inside opening hours, within `days_ahead` days. `taken` maps slot ISO → orders already booked.
 */
export function buildSlots(
  s: Pick<Settings, "is_open" | "hours" | "allow_scheduled" | "slot_minutes" | "slot_capacity" | "lead_minutes" | "days_ahead">,
  taken: Record<string, number> = {},
  now = new Date(),
): Slot[] {
  if (!s.is_open || !s.allow_scheduled || !hasHours(s.hours)) return [];
  const step = Math.max(10, s.slot_minutes || 30) * 60000;
  const earliest = now.getTime() + Math.max(0, s.lead_minutes) * 60000;
  const lastDay = addDays(dubaiClock(now).ymd, Math.max(0, s.days_ahead));
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const [a, b] of intervals(s.hours, now, s.days_ahead + 1)) {
    for (let t = a.getTime(); t < b.getTime(); t += step) {
      if (t < earliest) continue;
      const d = new Date(t);
      if (dubaiClock(d).ymd > lastDay) continue;
      const iso = d.toISOString();
      if (seen.has(iso)) continue;
      seen.add(iso);
      slots.push({
        start: iso,
        day: fmtDay(d, now),
        time: fmtTime(d),
        full: s.slot_capacity > 0 && (taken[iso] ?? 0) >= s.slot_capacity,
      });
    }
  }
  return slots.sort((x, y) => x.start.localeCompare(y.start));
}

/** Normalises any timestamp string to the ISO form used as slot keys. */
export const slotKey = (ts: string) => new Date(ts).toISOString();

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
