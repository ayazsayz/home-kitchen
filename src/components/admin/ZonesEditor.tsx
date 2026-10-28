"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { normalise } from "@/lib/format";
import type { DeliveryZone } from "@/lib/types";

type Row = Omit<DeliveryZone, "id"> & { id?: string; dirty?: boolean };

/** Delivery areas with their own fee and (optional) minimum order. */
export default function ZonesEditor() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await db.from("delivery_zones").select("*").order("sort");
    setRows((data ?? []).map((z) => normalise(z) as DeliveryZone));
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (i: number, patch: Partial<Row>) =>
    setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...patch, dirty: true } : r)));

  async function saveAll() {
    setBusy(true);
    setMsg("");
    const changed = rows
      .map((r, i) => ({ ...r, sort: i }))
      .filter((r) => r.name.trim() && (r.dirty || !r.id));
    for (const r of changed) {
      const payload = {
        name: r.name.trim(),
        fee: Number(r.fee) || 0,
        min_order: r.min_order === null || (r.min_order as unknown) === "" ? null : Number(r.min_order),
        active: r.active,
        sort: r.sort,
      };
      const { error } = r.id
        ? await db.from("delivery_zones").update(payload).eq("id", r.id)
        : await db.from("delivery_zones").insert(payload);
      if (error) {
        setBusy(false);
        return setMsg(error.message);
      }
    }
    setBusy(false);
    setMsg("Saved");
    setTimeout(() => setMsg(""), 2500);
    load();
  }

  async function remove(i: number) {
    const r = rows[i];
    if (r.id) {
      if (!confirm(`Delete area "${r.name}"?`)) return;
      await db.from("delivery_zones").delete().eq("id", r.id);
    }
    setRows((cur) => cur.filter((_, k) => k !== i));
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">Delivery areas</h2>
        <p className="text-sm text-muted">
          Customers pick their area at checkout and pay that fee. With no areas, the single delivery fee in Settings is used.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Area</th>
              <th className="w-24 px-2 py-2 font-medium">Fee</th>
              <th className="w-28 px-2 py-2 font-medium">Min order</th>
              <th className="w-14 px-2 py-2 font-medium">On</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted">No areas yet.</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id ?? `new-${i}`} className="border-t border-line">
                <td className="px-3 py-1.5">
                  <input className="input py-1.5" placeholder="e.g. Al Nahda" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <input className="input py-1.5" type="number" min={0} step="any" value={r.fee}
                    onChange={(e) => set(i, { fee: e.target.value as unknown as number })} />
                </td>
                <td className="px-2 py-1.5">
                  <input className="input py-1.5" type="number" min={0} step="any" placeholder="Default" value={r.min_order ?? ""}
                    onChange={(e) => set(i, { min_order: e.target.value === "" ? null : (e.target.value as unknown as number) })} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" className="h-4 w-4 accent-ok" checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} />
                </td>
                <td className="px-1 py-1.5">
                  <button className="px-1 text-red-600" onClick={() => remove(i)} aria-label="Delete area">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={() => setRows([...rows, { name: "", fee: 0, min_order: null, active: true, sort: rows.length }])}>
          + Add area
        </button>
        <button className="btn" onClick={saveAll} disabled={busy}>{busy ? "Saving…" : "Save areas"}</button>
        {msg && <span className={`text-sm ${msg === "Saved" ? "text-ok" : "text-red-700"}`}>{msg}</span>}
      </div>
    </section>
  );
}
