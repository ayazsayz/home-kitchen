import { LOCALE } from "./i18n";
import type { Lang } from "./types";
import type { Closure, Settings, TimeRange, WeeklyHours } from "./types";

import { DEFAULT_TZ, addDays, zoned, zonedInstant } from "./tz";

/**
 * Opening hours and time slots, in the shop's time zone (settings.timezone).
 * Works the same on the server and in the browser, including zones with daylight saving.
 */
const DAY = 24 * 60;
type TzSettings = { timezone?: string; closures?: Closure[] };
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

/** The holiday/closure covering a date (YYYY-MM-DD in the shop's time zone), if any. */
export function closureOn(ymd: string, closures: Closure[] | undefined): Closure | undefined {
  return closures?.find((c) => c.from && c.to && ymd >= c.from && ymd <= c.to);
}

/** Closure in force right now (shop time zone). */
export const currentClosure = (s: TzSettings, now = new Date()) => closureOn(zoned(now, tzOf(s)).ymd, s.closures);

/** Absolute open intervals overlapping [from, from + days], skipping closure days. */
function intervals(hours: WeeklyHours, from: Date, days: number, tz: string, closures?: Closure[]): [Date, Date][] {
  const start = zoned(from, tz).ymd;
  const out: [Date, Date][] = [];
  for (let i = -1; i <= days; i++) {
    const ymd = addDays(start, i);
    if (closureOn(ymd, closures)) continue;
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
  if (currentClosure(s, now)) return false;
  if (!s.auto_hours || !hasHours(s.hours)) return true;
  return withinHours(s.hours, now, tzOf(s));
}

/** Next time the kitchen opens (from the weekly hours), or null. */
export function nextOpening(s: Pick<Settings, "hours"> & TzSettings, now = new Date()): Date | null {
  const tz = tzOf(s);
  if (!hasHours(s.hours)) {
    // No weekly hours: open again the morning after the closure ends.
    let c = currentClosure(s, now);
    if (!c) return null;
    let day = addDays(c.to, 1);
    while ((c = closureOn(day, s.closures))) day = addDays(c.to, 1); // back-to-back closures
    return zonedInstant(day, 0, tz);
  }
  const next = intervals(s.hours, now, 45, tz, s.closures).find(([a, b]) => a > now || (now >= a && now < b));
  if (!next) return null;
  return next[0] > now ? next[0] : now;
}

export type Slot = {
  start: string; // ISO instant
  day: string; // "Today", "Tomorrow", "Thu 30 Oct"
  time: string; // "7:30 PM"
  full: boolean;
};

const DAY_WORDS: Record<Lang, [string, string]> = { en: ["Today", "Tomorrow"], ar: ["اليوم", "غداً"], ur: ["آج", "کل"] };

export const fmtTime = (d: Date, tz = DEFAULT_TZ, lang: Lang = "en") =>
  d.toLocaleTimeString(LOCALE[lang], { timeZone: tz, hour: "numeric", minute: "2-digit" });
export function fmtDay(d: Date, tz = DEFAULT_TZ, now = new Date(), lang: Lang = "en") {
  const a = zoned(d, tz).ymd;
  const today = zoned(now, tz).ymd;
  if (a === today) return DAY_WORDS[lang][0];
  if (a === addDays(today, 1)) return DAY_WORDS[lang][1];
  return d.toLocaleDateString(lang === "en" ? "en-GB" : LOCALE[lang], { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
}
/** "Today, 7:30 PM" in the shop's time zone (and the customer's language). */
export const fmtWhen = (iso: string, tz = DEFAULT_TZ, now = new Date(), lang: Lang = "en") =>
  `${fmtDay(new Date(iso), tz, now, lang)}${lang === "en" ? "," : "،"} ${fmtTime(new Date(iso), tz, lang)}`;

/** "Mon 2 Nov" when it's midnight (back after a closure), otherwise "Mon 2 Nov, 9:00 AM". */
export const fmtBack = (iso: string, tz = DEFAULT_TZ, lang: Lang = "en") =>
  zoned(new Date(iso), tz).minutes === 0 ? fmtDay(new Date(iso), tz, new Date(), lang) : fmtWhen(iso, tz, new Date(), lang);

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
  for (const [a, b] of intervals(s.hours, now, s.days_ahead + 1, tz, s.closures)) {
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
