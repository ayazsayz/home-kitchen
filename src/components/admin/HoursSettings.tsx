"use client";
import { DAY_NAMES, buildSlots, fmtWhen, hasHours, isOpenNow, nextOpening, toMinutes } from "@/lib/schedule";
import type { Settings, TimeRange, WeeklyHours } from "@/lib/types";

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

/** Weekly opening hours + scheduled-order settings (part of the Settings form). */
export default function HoursSettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const hours: WeeklyHours = s.hours ?? {};
  const setDay = (d: number, ranges: TimeRange[]) => set("hours", { ...hours, [String(d)]: ranges });
  const copyToAll = (d: number) => {
    const src = hours[String(d)] ?? [];
    set("hours", Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((k) => [String(k), src.map((r) => ({ ...r }))])));
  };

  const configured = hasHours(hours);
  const openNow = isOpenNow(s);
  const next = !openNow && s.is_open ? nextOpening(s) : null;
  const preview = buildSlots({ ...s, allow_scheduled: true }).slice(0, 4);
  const badRange = Object.values(hours).flat().some((r) => r && (toMinutes(r.open) == null || toMinutes(r.close) == null));

  return (
    <div className="card space-y-4 p-4">
      <div>
        <div className="font-semibold">Opening hours & pre-orders</div>
        <p className="text-sm text-muted">Dubai time. Close earlier than open (e.g. 18:00 → 01:00) means after midnight.</p>
      </div>

      <div className="space-y-2">
        {ORDER.map((d) => {
          const ranges = hours[String(d)] ?? [];
          const open = ranges.length > 0;
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-32 items-center gap-2 font-medium">
                <input type="checkbox" className="h-4 w-4 accent-ok" checked={open}
                  onChange={(e) => setDay(d, e.target.checked ? [{ open: "12:00", close: "22:00" }] : [])} />
                {DAY_NAMES[d]}
              </label>
              {!open && <span className="text-muted">Closed</span>}
              {ranges.map((r, i) => (
                <span key={i} className="flex items-center gap-1">
                  <input type="time" className="rounded-lg border border-line bg-paper px-2 py-1" value={r.open} aria-label={`${DAY_NAMES[d]} open`}
                    onChange={(e) => setDay(d, ranges.map((x, k) => (k === i ? { ...x, open: e.target.value } : x)))} />
                  –
                  <input type="time" className="rounded-lg border border-line bg-paper px-2 py-1" value={r.close} aria-label={`${DAY_NAMES[d]} close`}
                    onChange={(e) => setDay(d, ranges.map((x, k) => (k === i ? { ...x, close: e.target.value } : x)))} />
                  {ranges.length > 1 && (
                    <button type="button" className="px-1 text-red-600" onClick={() => setDay(d, ranges.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
                  )}
                </span>
              ))}
              {open && ranges.length < 2 && (
                <button type="button" className="text-xs text-brand" onClick={() => setDay(d, [...ranges, { open: "18:00", close: "23:00" }])}>+ split shift</button>
              )}
              {open && (
                <button type="button" className="text-xs text-muted" onClick={() => copyToAll(d)}>copy to all days</button>
              )}
            </div>
          );
        })}
      </div>
      {badRange && <p className="text-sm text-red-700">Some times are incomplete.</p>}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-ok" checked={s.auto_hours} disabled={!configured}
          onChange={(e) => set("auto_hours", e.target.checked)} />
        <span>
          <b>Open and close automatically</b> by these hours.
          <span className="block text-muted">The big Open/Closed switch above still wins: turn it off for holidays.</span>
        </span>
      </label>

      <hr className="border-line" />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-ok" checked={s.allow_asap} onChange={(e) => set("allow_asap", e.target.checked)} />
        Take &quot;as soon as possible&quot; orders while open
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-ok" checked={s.allow_scheduled} disabled={!configured}
          onChange={(e) => set("allow_scheduled", e.target.checked)} />
        Let customers schedule orders for a later time {!configured && <span className="text-muted">(set hours first)</span>}
      </label>

      {s.allow_scheduled && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label="Slot length (min)" value={s.slot_minutes} min={10} step={5} onChange={(v) => set("slot_minutes", v)} />
          <Num label="Orders per slot" value={s.slot_capacity} min={0} hint="0 = no limit" onChange={(v) => set("slot_capacity", v)} />
          <Num label="Earliest (min ahead)" value={s.lead_minutes} min={0} step={5} onChange={(v) => set("lead_minutes", v)} />
          <Num label="Days ahead" value={s.days_ahead} min={0} max={14} onChange={(v) => set("days_ahead", v)} />
        </div>
      )}

      <div className="rounded-xl bg-cream px-3 py-2 text-sm">
        Right now: <b>{openNow ? "Open" : "Closed"}</b>
        {next && <> · opens {fmtWhen(next.toISOString())}</>}
        {s.allow_scheduled && preview.length > 0 && (
          <> · next slots: {preview.map((p) => `${p.day} ${p.time}`).join(", ")}</>
        )}
        <span className="block text-xs text-muted">Preview of what you&apos;re editing — save to apply.</span>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, min, max, step = 1, hint }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" min={min} max={max} step={step} value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
