/**
 * Time-zone helpers that work for any IANA zone (including ones with daylight saving),
 * identically on the server and in the browser.
 */
export const DEFAULT_TZ = "Asia/Dubai";

export function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a zone. */
export function zoned(d: Date, tz = DEFAULT_TZ) {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(d)) p[x.type] = x.value;
  const ymd = `${p.year}-${p.month}-${p.day}`;
  const hour = Number(p.hour) % 24;
  return {
    ymd,
    dow: new Date(`${ymd}T00:00:00Z`).getUTCDay(),
    minutes: hour * 60 + Number(p.minute),
    /** offset from UTC in minutes at that instant (e.g. +240 for Dubai) */
    offset: Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000),
  };
}

/** The instant when the clock in `tz` shows `ymd` + `minutes` past midnight (minutes may exceed 1440). */
export function zonedInstant(ymd: string, minutes: number, tz = DEFAULT_TZ): Date {
  const wall = Date.parse(`${ymd}T00:00:00Z`) + minutes * 60000;
  let t = wall - zoned(new Date(wall), tz).offset * 60000;
  t = wall - zoned(new Date(t), tz).offset * 60000; // second pass settles DST edges
  return new Date(t);
}

/** Today's date (YYYY-MM-DD) in the zone. */
export const todayIn = (tz = DEFAULT_TZ, now = new Date()) => zoned(now, tz).ymd;
export const dateIn = (iso: string, tz = DEFAULT_TZ) => zoned(new Date(iso), tz).ymd;
export const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** ISO instants for the start of a local day and the start of the next one. */
export const dayStartIso = (ymd: string, tz = DEFAULT_TZ) => zonedInstant(ymd, 0, tz).toISOString();
export const dayEndIso = (ymd: string, tz = DEFAULT_TZ) => zonedInstant(addDays(ymd, 1), 0, tz).toISOString();

/** "28 Oct, 19:30" */
export function timeShort(iso: string, tz = DEFAULT_TZ) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
/** Full local date-time for CSV exports. */
export const dateTimeFull = (iso: string, tz = DEFAULT_TZ) => new Date(iso).toLocaleString("en-GB", { timeZone: tz });

/** Short label like "Dubai (UTC+4)". */
export function tzLabel(tz: string, now = new Date()) {
  const off = zoned(now, tz).offset;
  const h = Math.trunc(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `${tz.split("/").pop()!.replace(/_/g, " ")} (UTC${off < 0 ? "−" : "+"}${h}${m ? `:${String(m).padStart(2, "0")}` : ""})`;
}
