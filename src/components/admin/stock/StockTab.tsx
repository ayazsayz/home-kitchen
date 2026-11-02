"use client";
import { Fragment, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money } from "@/lib/format";
import { timeShort } from "@/lib/tz";
import { UNITS, dailyUsage, daysLeft, fmtQty, isLow, stockValue } from "@/lib/inventory";
import type { StockItem, StockMoveKind } from "@/lib/types";
import type { InvProps } from "./StockPage";

const KIND_LABEL: Record<StockMoveKind, string> = { purchase: "Received", sale: "Used in orders", waste: "Waste", count: "Stock count", adjust: "Adjustment" };
const EMPTY = { name: "", unit: "pcs", category: "", low_level: "", qty: "", avg_cost: "" };

/** Stock levels, add items, record waste / adjustments, and full stock counts. */
export default function StockTab({ data, reload, go }: InvProps) {
  const db = useMemo(() => supabaseBrowser(), []);
  const { items, moves, cur } = data;
  const [filter, setFilter] = useState<"all" | "low">("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<{ item: StockItem; kind: "waste" | "adjust"; amount: string; note: string } | null>(null);
  const [counting, setCounting] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const usage = useMemo(() => dailyUsage(moves), [moves]);
  const active = items.filter((i) => i.active);
  const low = active.filter(isLow);
  const shown = (filter === "low" ? low : items).filter((i) => !q.trim() || `${i.name} ${i.category}`.toLowerCase().includes(q.trim().toLowerCase()));
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setMsg("");
    const row = {
      name: form.name.trim(),
      unit: form.unit.trim() || "pcs",
      category: form.category.trim(),
      low_level: Math.max(0, Number(form.low_level) || 0),
      avg_cost: Math.max(0, Number(form.avg_cost) || 0),
    };
    if (editId) {
      const { error } = await db.from("stock_items").update(row).eq("id", editId);
      if (error) setMsg(error.message);
    } else {
      const { data: ins, error } = await db.from("stock_items").insert({ ...row, sort: items.length }).select("id").single();
      if (error) setMsg(error.message);
      const start = Number(form.qty) || 0;
      if (ins && start) await db.from("stock_moves").insert({ stock_item_id: ins.id, change: start, kind: "count", note: "Opening stock", created_by_name: data.me });
    }
    setBusy(false);
    setForm(null);
    setEditId(null);
    reload();
  }

  async function saveAdjust() {
    if (!adjust) return;
    const n = Number(adjust.amount);
    if (!n) return setMsg("Enter an amount");
    const change = adjust.kind === "waste" ? -Math.abs(n) : n;
    setBusy(true);
    await db.from("stock_moves").insert({ stock_item_id: adjust.item.id, change, kind: adjust.kind, note: adjust.note.trim().slice(0, 200), created_by_name: data.me });
    setBusy(false);
    setAdjust(null);
    await reload();
    setMsg(`${adjust.kind === "waste" ? "Waste" : "Adjustment"} saved: ${adjust.item.name} ${change > 0 ? "+" : ""}${fmtQty(change, adjust.item.unit)}.`);
  }

  async function saveCount() {
    if (!counting) return;
    const rows = Object.entries(counting)
      .filter(([, v]) => v.trim() !== "")
      .map(([id, v]) => {
        const it = items.find((x) => x.id === id)!;
        return { it, change: Math.round((Number(v) - it.qty) * 1000) / 1000 };
      })
      .filter((r) => r.it && Number.isFinite(r.change) && r.change !== 0);
    setBusy(true);
    if (rows.length) {
      await db.from("stock_moves").insert(rows.map((r) => ({ stock_item_id: r.it.id, change: r.change, kind: "count", note: "Stock count", created_by_name: data.me })));
    }
    setBusy(false);
    setCounting(null);
    await reload();
    setMsg(rows.length ? `Stock count saved: ${rows.length} item${rows.length > 1 ? "s" : ""} corrected.` : "Stock count saved: everything matched.");
  }

  async function toggleActive(i: StockItem) {
    await db.from("stock_items").update({ active: !i.active }).eq("id", i.id);
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items" value={String(active.length)} />
        <Stat label="Low or out" value={String(low.length)} tone={low.length ? "text-red-700" : ""} />
        <Stat label="Stock value" value={money(stockValue(active), cur)} />
        <Stat label="Used last 7 days" value={money(Math.abs(moves.filter((m) => m.kind === "sale" && Date.now() - Date.parse(m.created_at) < 7 * 86400000).reduce((s, m) => s + m.change * (items.find((i) => i.id === m.stock_item_id)?.avg_cost ?? 0), 0)), cur)} />
      </div>

      {low.length > 0 && (
        <div className="card flex flex-wrap items-center gap-3 border-red-200 bg-red-50 p-3 text-sm" data-testid="low-stock">
          <b className="text-red-800">⚠️ Running low:</b>
          <span className="min-w-0 flex-1 text-red-900">{low.map((i) => `${i.name} (${fmtQty(i.qty, i.unit)})`).join(", ")}</span>
          <button type="button" className="btn py-1.5 text-sm" onClick={() => go("purchases", { newPurchase: { itemIds: low.map((i) => i.id) } })}>Order these</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-auto min-w-0 flex-1 py-2" placeholder="🔍 Search stock" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stock" />
        <button type="button" className={`rounded-full px-3 py-1 text-sm ${filter === "all" ? "bg-ink text-white" : "border border-line bg-paper"}`} onClick={() => setFilter("all")}>All</button>
        <button type="button" className={`rounded-full px-3 py-1 text-sm ${filter === "low" ? "bg-ink text-white" : "border border-line bg-paper"}`} onClick={() => setFilter("low")}>Low ({low.length})</button>
        <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => setCounting(Object.fromEntries(active.map((i) => [i.id, ""])))} disabled={!active.length}>📋 Count stock</button>
        <button type="button" className="btn py-1.5 text-sm" onClick={() => { setForm({ ...EMPTY }); setEditId(null); }}>+ Add item</button>
      </div>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{msg}</p>}

      {counting ? (
        <div className="card space-y-3 p-4" data-testid="count-form">
          <div>
            <h2 className="font-semibold">📋 Stock count</h2>
            <p className="text-sm text-muted">Enter what you actually have. Leave blank to skip an item. Differences are saved as corrections.</p>
          </div>
          <ul className="divide-y divide-line">
            {active.map((i) => {
              const v = counting[i.id] ?? "";
              const diff = v.trim() === "" ? null : Number(v) - i.qty;
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><b>{i.name}</b> <span className="text-muted">· system {fmtQty(i.qty, i.unit)}</span></span>
                  <input className="input w-28 py-1.5" type="number" step="any" inputMode="decimal" value={v} aria-label={`Counted ${i.name}`}
                    onChange={(e) => setCounting({ ...counting, [i.id]: e.target.value })} />
                  <span className="w-10 text-muted">{i.unit}</span>
                  <span className={`w-24 text-right ${diff == null || diff === 0 ? "text-muted" : diff < 0 ? "text-red-700" : "text-ok"}`}>
                    {diff == null ? "" : diff === 0 ? "✓" : `${diff > 0 ? "+" : ""}${fmtQty(diff)}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={saveCount} disabled={busy}>Save count</button>
            <button type="button" className="btn-ghost" onClick={() => setCounting(null)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-2 py-2 text-right font-medium">In stock</th>
                <th className="px-2 py-2 text-right font-medium">Low at</th>
                <th className="px-2 py-2 text-right font-medium">Lasts</th>
                <th className="px-2 py-2 text-right font-medium">Avg cost</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{items.length ? "Nothing here." : "No stock items yet — add your ingredients and packaging."}</td></tr>
              )}
              {shown.map((i) => {
                const d = daysLeft(i.qty, usage[i.id]);
                const hist = moves.filter((m) => m.stock_item_id === i.id).slice(0, 15);
                return (
                  <Fragment key={i.id}>
                    <tr className={`border-t border-line ${!i.active ? "opacity-50" : ""} ${isLow(i) ? "bg-red-50/60" : ""}`} data-testid="stock-row">
                      <td className="px-4 py-2">
                        <button type="button" className="text-left font-medium hover:text-brand" onClick={() => setOpen(open === i.id ? null : i.id)}>{i.name}</button>
                        {i.category && <span className="ms-2 rounded bg-cream px-1.5 text-xs text-muted">{i.category}</span>}
                      </td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right font-semibold ${isLow(i) ? "text-red-700" : ""}`} data-testid="stock-qty">{fmtQty(i.qty, i.unit)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted">{i.low_level ? fmtQty(i.low_level, i.unit) : "—"}</td>
                      <td className={`whitespace-nowrap px-2 py-2 text-right ${d != null && d < 2 ? "font-semibold text-red-700" : "text-muted"}`}>{d == null ? "—" : d < 1 ? "< 1 day" : `~${Math.floor(d)} days`}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-muted">{i.avg_cost ? `${money(i.avg_cost, cur)}/${i.unit}` : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <button type="button" className="me-3 text-brand" onClick={() => setAdjust({ item: i, kind: "waste", amount: "", note: "" })} aria-label={`Waste or adjust ${i.name}`}>± Adjust</button>
                        <button type="button" className="text-muted" onClick={() => { setEditId(i.id); setForm({ name: i.name, unit: i.unit, category: i.category, low_level: String(i.low_level || ""), qty: "", avg_cost: String(i.avg_cost || "") }); }}>Edit</button>
                      </td>
                    </tr>
                    {open === i.id && (
                      <tr className="bg-cream/50">
                        <td colSpan={6} className="px-4 py-3 text-sm">
                          <div className="mb-1 font-semibold">Recent changes</div>
                          {hist.length === 0 ? <p className="text-muted">No changes in the last 60 days.</p> : (
                            <ul className="space-y-0.5">
                              {hist.map((m) => (
                                <li key={m.id} className="flex flex-wrap gap-3">
                                  <span className="w-28 text-muted">{timeShort(m.created_at, data.settings.timezone)}</span>
                                  <span className={`w-20 text-right font-medium ${m.change < 0 ? "text-red-700" : "text-ok"}`}>{m.change > 0 ? "+" : ""}{fmtQty(m.change)}</span>
                                  <span>{KIND_LABEL[m.kind]}{m.note ? ` · ${m.note}` : ""}{m.created_by_name ? ` · ${m.created_by_name}` : ""}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <button type="button" className="mt-2 text-xs text-muted underline" onClick={() => toggleActive(i)}>{i.active ? "Stop tracking this item" : "Track this item again"}</button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Stock goes down automatically when an order is completed, using each dish&apos;s recipe (Menu → edit dish → Recipe). It goes up when you receive a
        purchase. &quot;Lasts&quot; is based on the last 14 days of use.
      </p>

      {form && (
        <Modal title={editId ? "Edit stock item" : "Add stock item"} onClose={() => setForm(null)}>
          <form onSubmit={saveItem} className="space-y-3">
            <Field label="Name"><input id="si-name" className="input" required placeholder="e.g. Burger buns" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit">
                <input id="si-unit" className="input" list="units" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
              </Field>
              <Field label="Category">
                <input id="si-category" className="input" list="stock-cats" placeholder="Meat, Bread, Packaging…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id="stock-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Warn when at or below"><input id="si-low" className="input" type="number" min={0} step="any" value={form.low_level} onChange={(e) => setForm({ ...form, low_level: e.target.value })} /></Field>
              <Field label={`Cost per ${form.unit || "unit"}`}><input id="si-cost" className="input" type="number" min={0} step="any" value={form.avg_cost} onChange={(e) => setForm({ ...form, avg_cost: e.target.value })} /></Field>
              {!editId && <Field label="Have now (opening stock)"><input id="si-qty" className="input" type="number" step="any" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>}
            </div>
            <p className="text-xs text-muted">The cost updates by itself from what you pay when receiving purchases.</p>
            <div className="flex gap-2">
              <button className="btn" disabled={busy}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {adjust && (
        <Modal title={`${adjust.item.name} — now ${fmtQty(adjust.item.qty, adjust.item.unit)}`} onClose={() => setAdjust(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(["waste", "adjust"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setAdjust({ ...adjust, kind: k })}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${adjust.kind === k ? "border-brand bg-brand/10 text-brand-dark" : "border-line"}`}>
                  {k === "waste" ? "🗑 Waste / spoiled" : "± Correction"}
                </button>
              ))}
            </div>
            <Field label={adjust.kind === "waste" ? `How much was thrown away (${adjust.item.unit})` : `Change (${adjust.item.unit}, use − to reduce)`}>
              <input id="adj-amount" className="input" type="number" step="any" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
            </Field>
            <Field label="Reason (optional)"><input id="adj-note" className="input" placeholder="Expired, dropped, found extra…" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} /></Field>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={saveAdjust} disabled={busy}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => setAdjust(null)}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className={`card max-h-[92dvh] w-full ${wide ? "max-w-2xl" : "max-w-md"} space-y-3 overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
