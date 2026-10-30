"use client";
import { currentClosure } from "@/lib/schedule";
import { addDays, todayIn } from "@/lib/tz";
import type { Closure, Settings } from "@/lib/types";

/** Holidays and days off (e.g. Eid). The shop shows "Closed for … — back …" and takes no orders for those dates. */
export default function ClosuresSettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const today = todayIn(s.timezone);
  const list = s.closures ?? [];
  const update = (i: number, p: Partial<Closure>) => set("closures", list.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const now = currentClosure(s);
  return (
    <div className="card space-y-3 p-4" data-testid="closures">
      <div>
        <div className="font-semibold">🌙 Holidays & days off</div>
        <p className="text-sm text-muted">
          For Eid, travel or a family event. On these dates the menu says &quot;Closed for … — back …&quot; and no orders (or pre-orders) are taken for
          them. Dates are in your shop&apos;s time zone; both days are included.
        </p>
      </div>
      {now && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Closed today{now.note ? ` (${now.note})` : ""}.</p>}
      {list.length === 0 && <p className="text-sm text-muted">No days off planned.</p>}
      <ul className="space-y-2">
        {list.map((c, i) => {
          const past = c.to && c.to < today;
          return (
            <li key={i} className={`grid grid-cols-2 gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1fr_1.4fr_auto] ${past ? "opacity-50" : ""}`}>
              <label className="text-xs text-muted">From
                <input type="date" className="input mt-0.5 py-1.5" value={c.from} aria-label={`Closure ${i + 1} from`}
                  onChange={(e) => update(i, { from: e.target.value, to: c.to && c.to < e.target.value ? e.target.value : c.to })} />
              </label>
              <label className="text-xs text-muted">To
                <input type="date" className="input mt-0.5 py-1.5" value={c.to} min={c.from} aria-label={`Closure ${i + 1} to`}
                  onChange={(e) => update(i, { to: e.target.value })} />
              </label>
              <label className="col-span-2 text-xs text-muted sm:col-span-1">Reason (shown to customers, optional)
                <input className="input mt-0.5 py-1.5" placeholder="e.g. Eid" maxLength={40} value={c.note} aria-label={`Closure ${i + 1} reason`}
                  onChange={(e) => update(i, { note: e.target.value })} />
              </label>
              <button type="button" className="col-span-2 self-end px-2 py-2 text-sm text-red-600 sm:col-span-1" aria-label={`Remove closure ${i + 1}`}
                onClick={() => set("closures", list.filter((_, k) => k !== i))}>
                ✕ Remove
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-ghost py-1.5 text-sm"
        onClick={() => set("closures", [...list, { from: addDays(today, 1), to: addDays(today, 1), note: "" }])}>
        + Add days off
      </button>
    </div>
  );
}
