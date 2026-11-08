"use client";
import { autoDayEnd } from "@/lib/schedule";
import type { Settings } from "@/lib/types";

const label = (h: number) => (h === 0 ? "Midnight (12:00 AM)" : `${h}:00 AM`);

/**
 * When the business day ends. Orders after midnight but before this hour count for the day before
 * (sales report, daily summary, daily dish limits, drivers' "today").
 */
export default function BusinessDaySettings({
  s,
  set,
  enabled,
}: {
  s: Settings;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  enabled: boolean;
}) {
  const auto = autoDayEnd(s.hours);
  const h = s.day_end_hour ?? auto;
  return (
    <div className="card space-y-2 p-4" data-testid="business-day">
      <div className="font-semibold">🌃 Business day ends at</div>
      <p className="text-sm text-muted">
        For shops open past midnight. Orders placed after midnight but before this time count for the day before — e.g. open 7 Nov at 5 PM,
        orders at 12:01 AM, 1 AM and 3:59 AM on 8 Nov count as 7 Nov; 4:00 AM or later counts as 8 Nov. Used by the sales report, daily summary,
        daily dish limits and the drivers&apos; screen.
      </p>
      {enabled ? (
        <>
          <select
            id="day-end"
            className="input w-64"
            value={s.day_end_hour == null ? "auto" : String(s.day_end_hour)}
            onChange={(e) => set("day_end_hour", e.target.value === "auto" ? null : Number(e.target.value))}
          >
            <option value="auto">Auto — {label(auto)}</option>
            {[0, 1, 2, 3, 4, 5, 6].map((x) => (
              <option key={x} value={x}>{label(x)}</option>
            ))}
          </select>
          <p className="text-xs text-muted" data-testid="day-end-note">
            {h === 0
              ? "Days run midnight to midnight (normal calendar days)."
              : `A day runs from ${label(h)} to ${label(h)} the next morning.`}
            {s.day_end_hour == null && " Auto = your latest closing time after midnight + 1 hour; midnight if you close before midnight."}
          </p>
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Needs a quick database update (migration 015). Until then days run midnight to midnight{auto ? ` (Auto would use ${label(auto)})` : ""}.
        </p>
      )}
    </div>
  );
}
