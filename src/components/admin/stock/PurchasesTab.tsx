"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, roundMoney } from "@/lib/format";
import { todayIn, timeShort } from "@/lib/tz";
import { whatsappLink } from "@/lib/whatsapp";
import { normalisePhone } from "@/lib/region";
import { UNITS, fmtQty, lastPrices, purchaseMessage } from "@/lib/inventory";
import type { Purchase } from "@/lib/types";
import type { InvProps } from "./StockPage";
import { Field, Modal } from "./StockTab";

type Line = { key: string; id?: string; stock_item_id: string; qty: string; unit_price: string; newName?: string; newUnit?: string };
const NEW = "__new"; // "+ New item…" typed straight into the purchase
const blank = (newItem = false): Line => ({ key: crypto.randomUUID(), stock_item_id: newItem ? NEW : "", qty: "", unit_price: "", newName: "", newUnit: "pcs" });

/** Purchase orders to suppliers: create, send on WhatsApp, receive (stock + expense + payment), cancel. */
export default function PurchasesTab({ data, reload, draft, clearDraft }: InvProps & { draft: { supplierId?: string; itemIds?: string[] } | null; clearDraft: () => void }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const { items, suppliers, purchases, cur, settings } = data;
  const active = items.filter((i) => i.active);
  const itemOf = (id: string) => items.find((i) => i.id === id);
  const supplierOf = (id: string | null) => suppliers.find((s) => s.id === id);
  const [filter, setFilter] = useState<"open" | "received" | "all">("open");
  const [form, setForm] = useState<{ supplierId: string; note: string; lines: Line[] } | null>(null);
  const [receiving, setReceiving] = useState<{ p: Purchase; lines: Line[]; paid: string; paidWith: "cash" | "card" | "bank"; category: string; day: string } | null>(null);
  const [sent, setSent] = useState<{ p: Purchase; link: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const priceFor = (itemId: string, supplierId: string) => {
    const last = lastPrices(purchases, supplierId || null)[itemId] ?? lastPrices(purchases)[itemId];
    return last ?? itemOf(itemId)?.avg_cost ?? 0;
  };

  // "Order these" from the Stock tab: start a purchase with the low items and a suggested quantity.
  useEffect(() => {
    if (!draft) return;
    const supplierId = draft.supplierId ?? "";
    const lines = (draft.itemIds ?? []).map((id) => {
      const it = itemOf(id);
      const want = it ? Math.max(1, Math.ceil(Math.max(it.low_level * 2, it.low_level + 1) - Math.max(0, it.qty))) : 1;
      return { ...blank(), stock_item_id: id, qty: String(want), unit_price: String(priceFor(id, supplierId) || "") };
    });
    setForm({ supplierId, note: "", lines: lines.length ? lines : [blank()] });
    clearDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const estTotal = (lines: Line[]) => roundMoney(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0), 3);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setErr("");
    let lines = form.lines.filter((l) => l.stock_item_id && Number(l.qty) > 0);
    if (!lines.length) return setErr("Add at least one item with a quantity");
    if (lines.some((l) => l.stock_item_id === NEW && !l.newName?.trim())) return setErr("Type a name for the new item");
    const sup = supplierOf(form.supplierId);
    setBusy(true);
    // New items are added to Stock with 0 on hand; receiving the purchase adds the quantity.
    const known = [...items];
    for (const l of lines.filter((x) => x.stock_item_id === NEW)) {
      const name = l.newName!.trim();
      const existing = items.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        l.stock_item_id = existing.id;
        continue;
      }
      const { data: it, error: ierr } = await db
        .from("stock_items")
        .insert({ name, unit: (l.newUnit || "pcs").trim(), avg_cost: Math.max(0, Number(l.unit_price) || 0), sort: items.length })
        .select("*")
        .single();
      if (ierr || !it) {
        setBusy(false);
        return setErr(ierr?.message ?? "Could not add the new item");
      }
      l.stock_item_id = it.id;
      known.push({ ...it, qty: 0, low_level: 0, avg_cost: Number(it.avg_cost) });
    }
    lines = lines.map((l) => ({ ...l }));
    const { data: p, error } = await db
      .from("purchases")
      .insert({ supplier_id: sup?.id ?? null, supplier_name: sup?.name ?? "", status: "ordered", total: estTotal(lines), note: form.note.trim().slice(0, 300), created_by_name: data.me })
      .select("*")
      .single();
    if (error || !p) {
      setBusy(false);
      return setErr(error?.message ?? "Could not save");
    }
    const { error: lerr } = await db.from("purchase_lines").insert(lines.map((l) => ({ purchase_id: p.id, stock_item_id: l.stock_item_id, qty: Number(l.qty), unit_price: Math.max(0, Number(l.unit_price) || 0) })));
    setBusy(false);
    if (lerr) return setErr(lerr.message);
    setForm(null);
    const text = purchaseMessage(settings.name, p, lines.map((l) => ({ stock_item_id: l.stock_item_id, qty: Number(l.qty) })), known, sup);
    setSent(sup?.phone ? { p: p as Purchase, link: whatsappLink(normalisePhone(sup.phone, settings.phone_country_code), text) } : { p: p as Purchase, link: "" });
    setMsg(`Purchase #${p.purchase_no} saved.`);
    reload();
  }

  function startReceive(p: Purchase) {
    setErr("");
    setReceiving({
      p,
      lines: (p.purchase_lines ?? []).map((l) => ({ key: l.id, id: l.id, stock_item_id: l.stock_item_id, qty: String(l.qty), unit_price: String(l.unit_price) })),
      paid: String(roundMoney(p.total, 3)),
      paidWith: "cash",
      category: settings.expense_categories.includes("Groceries") ? "Groceries" : settings.expense_categories[0] ?? "Other",
      day: todayIn(settings.timezone),
    });
  }

  async function receive() {
    if (!receiving) return;
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/admin/purchases/${receiving.p.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: receiving.lines.map((l) => ({ id: l.id, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0 })),
        paid: Number(receiving.paid) || 0,
        paid_with: receiving.paidWith,
        category: receiving.category,
        received_on: receiving.day,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error || "Could not receive");
    setReceiving(null);
    await reload();
    setMsg(`Purchase #${receiving.p.purchase_no} received: stock added, expense ${money(d.total, cur)} recorded${d.owed > 0 ? `, ${money(d.owed, cur)} on credit` : ", paid"}.`);
  }

  async function cancel(p: Purchase) {
    if (!confirm(`Cancel purchase #${p.purchase_no}?`)) return;
    await db.from("purchases").update({ status: "cancelled" }).eq("id", p.id).eq("status", "ordered");
    reload();
  }

  const shown = purchases.filter((p) => (filter === "open" ? p.status === "ordered" : filter === "received" ? p.status === "received" : true));
  const summary = (p: Purchase) => (p.purchase_lines ?? []).map((l) => `${itemOf(l.stock_item_id)?.name ?? "?"} ${fmtQty(l.qty, itemOf(l.stock_item_id)?.unit)}`).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "received", "all"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm ${filter === k ? "bg-ink text-white" : "border border-line bg-paper"}`}>
            {k === "open" ? `Waiting (${purchases.filter((p) => p.status === "ordered").length})` : k === "received" ? "Received" : "All"}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" className="btn py-1.5 text-sm" onClick={() => setForm({ supplierId: "", note: "", lines: [blank(!active.length)] })}>+ New purchase</button>
      </div>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{msg}</p>}
      {sent?.link && (
        <a className="btn bg-[#25D366] hover:bg-[#1da851]" href={sent.link} target="_blank" rel="noreferrer" data-testid="po-whatsapp">💬 Send order #{sent.p.purchase_no} to {sent.p.supplier_name} on WhatsApp</a>
      )}

      <ul className="space-y-2">
        {shown.length === 0 && <li className="card p-6 text-center text-sm text-muted">No purchases here.</li>}
        {shown.map((p) => {
          const sup = supplierOf(p.supplier_id);
          return (
            <li key={p.id} className="card flex flex-wrap items-center gap-3 p-3 text-sm" data-testid="purchase-row">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  #{p.purchase_no} · {p.supplier_name || "No supplier"}
                  <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${p.status === "ordered" ? "bg-amber-100 text-amber-900" : p.status === "received" ? "bg-green-100 text-green-800" : "bg-cream text-muted"}`}>
                    {p.status === "ordered" ? "Waiting" : p.status === "received" ? `Received ${p.received_on ?? ""}` : "Cancelled"}
                  </span>
                </div>
                <div className="truncate text-muted">{summary(p)}</div>
                <div className="text-xs text-muted">{timeShort(p.created_at, settings.timezone)}{p.created_by_name ? ` · ${p.created_by_name}` : ""}{p.note ? ` · ${p.note}` : ""}</div>
              </div>
              <b className="whitespace-nowrap">{money(p.total, cur)}</b>
              {p.status === "ordered" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn py-1.5 text-sm" onClick={() => startReceive(p)} aria-label={`Receive purchase ${p.purchase_no}`}>✓ Received</button>
                  {sup?.phone && (
                    <a className="btn-ghost py-1.5 text-sm" target="_blank" rel="noreferrer"
                      href={whatsappLink(normalisePhone(sup.phone, settings.phone_country_code), purchaseMessage(settings.name, p, p.purchase_lines ?? [], items, sup))}>💬</a>
                  )}
                  <button type="button" className="btn-ghost py-1.5 text-sm text-red-700" onClick={() => cancel(p)}>Cancel</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {form && (
        <Modal title="New purchase" onClose={() => setForm(null)} wide>
          <form onSubmit={create} className="space-y-3">
            <Field label="Supplier">
              <select id="po-supplier" className="input" value={form.supplierId}
                onChange={(e) => {
                  const supplierId = e.target.value;
                  setForm({ ...form, supplierId, lines: form.lines.map((l) => (l.stock_item_id ? { ...l, unit_price: String(priceFor(l.stock_item_id, supplierId) || "") } : l)) });
                }}>
                <option value="">No supplier (shop / market)</option>
                {suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_1.5rem] gap-2 text-xs text-muted"><span>Item</span><span>Qty</span><span>Price/unit</span><span /></div>
              {form.lines.map((l, idx) => {
                const it = itemOf(l.stock_item_id);
                return (
                  <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem_1.5rem] items-start gap-2" data-testid="po-line">
                    <div className="min-w-0 space-y-1">
                      <select className="input py-2" value={l.stock_item_id} aria-label={`Item ${idx + 1}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm({ ...form, lines: form.lines.map((x) => (x.key === l.key ? { ...x, stock_item_id: v, unit_price: v === NEW ? x.unit_price : String(priceFor(v, form.supplierId) || "") } : x)) });
                        }}>
                        <option value="">Choose…</option>
                        {active.map((i) => <option key={i.id} value={i.id}>{i.name} ({fmtQty(i.qty, i.unit)} left)</option>)}
                        <option value={NEW}>+ New item…</option>
                      </select>
                    </div>
                    <input className="input py-2" type="number" min={0} step="any" placeholder={l.stock_item_id === NEW ? l.newUnit || "qty" : it?.unit ?? "qty"} value={l.qty} aria-label={`Qty ${idx + 1}`}
                      onChange={(e) => setForm({ ...form, lines: form.lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)) })} />
                    <input className="input py-2" type="number" min={0} step="any" value={l.unit_price} aria-label={`Price ${idx + 1}`}
                      onChange={(e) => setForm({ ...form, lines: form.lines.map((x) => (x.key === l.key ? { ...x, unit_price: e.target.value } : x)) })} />
                    <button type="button" className="text-red-600" aria-label={`Remove line ${idx + 1}`} onClick={() => setForm({ ...form, lines: form.lines.filter((x) => x.key !== l.key) })}>✕</button>
                      {l.stock_item_id === NEW && (
                        <div className="col-span-4 grid grid-cols-[minmax(0,1fr)_6rem] gap-2 rounded-xl bg-cream p-2">
                          <label className="min-w-0">
                            <span className="mb-0.5 block text-xs text-muted">New item name</span>
                            <input className="input py-2" placeholder="e.g. Burger buns" value={l.newName} aria-label={`New item name ${idx + 1}`} autoFocus
                              onChange={(e) => setForm({ ...form, lines: form.lines.map((x) => (x.key === l.key ? { ...x, newName: e.target.value } : x)) })} />
                          </label>
                          <label className="min-w-0">
                            <span className="mb-0.5 block text-xs text-muted">Unit</span>
                            <input className="input py-2" list="po-units" value={l.newUnit} aria-label={`New item unit ${idx + 1}`}
                              onChange={(e) => setForm({ ...form, lines: form.lines.map((x) => (x.key === l.key ? { ...x, newUnit: e.target.value } : x)) })} />
                          </label>
                        </div>
                      )}
                  </div>
                );
              })}
              <datalist id="po-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
              <button type="button" className="text-sm text-brand" onClick={() => setForm({ ...form, lines: [...form.lines, blank(!active.length)] })}>+ Add item</button>
              <p className="text-xs text-muted">Not in your stock list yet? Choose <b>+ New item…</b> and type it. It&apos;s added to Stock automatically, and the quantity goes in when you mark the purchase received.</p>
            </div>
            <Field label="Note for the supplier (optional)"><input id="po-note" className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <div className="flex justify-between font-semibold"><span>Estimated total</span><span data-testid="po-total">{money(estTotal(form.lines), cur)}</span></div>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex gap-2">
              <button className="btn" disabled={busy}>Save purchase</button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {receiving && (
        <Modal title={`Receive purchase #${receiving.p.purchase_no}`} onClose={() => setReceiving(null)} wide>
          <p className="text-sm text-muted">Check what actually arrived and the real prices. Stock is added, the expense is recorded, and anything not paid now goes on the supplier&apos;s balance.</p>
          <div className="space-y-2">
            {receiving.lines.map((l, idx) => {
              const it = itemOf(l.stock_item_id);
              return (
                <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-center gap-2 text-sm" data-testid="rcv-line">
                  <span className="truncate font-medium">{it?.name} <span className="text-muted">({it?.unit})</span></span>
                  <input className="input py-2" type="number" min={0} step="any" value={l.qty} aria-label={`Received qty ${idx + 1}`}
                    onChange={(e) => setReceiving({ ...receiving, lines: receiving.lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)) })} />
                  <input className="input py-2" type="number" min={0} step="any" value={l.unit_price} aria-label={`Received price ${idx + 1}`}
                    onChange={(e) => setReceiving({ ...receiving, lines: receiving.lines.map((x) => (x.key === l.key ? { ...x, unit_price: e.target.value } : x)) })} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between font-semibold"><span>Total</span><span data-testid="rcv-total">{money(estTotal(receiving.lines), cur)}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid now"><input id="rcv-paid" className="input" type="number" min={0} step="any" value={receiving.paid} onChange={(e) => setReceiving({ ...receiving, paid: e.target.value })} /></Field>
            <Field label="Paid with">
              <select className="input" value={receiving.paidWith} onChange={(e) => setReceiving({ ...receiving, paidWith: e.target.value as "cash" | "card" | "bank" })}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option>
              </select>
            </Field>
            <Field label="Expense category">
              <select id="rcv-category" className="input" value={receiving.category} onChange={(e) => setReceiving({ ...receiving, category: e.target.value })}>
                {settings.expense_categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input" type="date" value={receiving.day} onChange={(e) => setReceiving({ ...receiving, day: e.target.value })} /></Field>
          </div>
          {Number(receiving.paid) < estTotal(receiving.lines) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {money(estTotal(receiving.lines) - (Number(receiving.paid) || 0), cur)} goes on {receiving.p.supplier_name || "the supplier"}&apos;s balance.
              {!receiving.p.supplier_id && " (No supplier chosen, so it can't be tracked.)"}
            </p>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={receive} disabled={busy}>{busy ? "Saving…" : "Confirm received"}</button>
            <button type="button" className="btn-ghost" onClick={() => setReceiving(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
