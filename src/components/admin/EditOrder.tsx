"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normalise, type Currency } from "@/lib/format";
import { optionsText } from "@/lib/options";
import OptionsSheet from "@/components/OptionsSheet";
import type { MenuItem, Order, PickedOption } from "@/lib/types";

type Line = { key: string; line_id?: string; id: string; name: string; qty: number; unit: number; choiceIds?: string[]; options: PickedOption[] };

/** Change the dishes on an order (phone call from the customer). Existing lines keep their price. */
export default function EditOrder({ order, cur, onClose, onSaved }: { order: Order; cur?: Currency; onClose: () => void; onSaved: (msg: string, total: number) => void }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [lines, setLines] = useState<Line[]>(() =>
    (order.order_items ?? []).map((i) => ({ key: i.id, line_id: i.id, id: i.menu_item_id ?? "", name: i.name, qty: i.qty, unit: i.unit_price, options: i.options ?? [] })),
  );
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    db.from("menu_items").select("*").eq("available", true).order("sort")
      .then(({ data }) => setMenu((data ?? []).map((x) => ({ ...normalise(x), option_groups: x.option_groups ?? [] }) as MenuItem)));
  }, [db]);

  const setQty = (key: string, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((l) => l.key !== key) : cur.map((l) => (l.key === key ? { ...l, qty } : l))));
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const hasOpts = (m: MenuItem) => m.option_groups?.some((g) => g.choices.length > 0);

  function addDish(id: string) {
    const m = menu.find((x) => x.id === id);
    if (!m) return;
    if (hasOpts(m)) return setPicking(m);
    const same = lines.find((l) => !l.line_id && l.id === m.id && !l.choiceIds?.length);
    if (same) return setQty(same.key, same.qty + 1);
    setLines((cur) => [...cur, { key: crypto.randomUUID(), id: m.id, name: m.name, qty: 1, unit: m.price, choiceIds: [], options: [] }]);
  }

  async function save() {
    if (!lines.length) return setErr("An order needs at least one dish. Use Cancel order instead.");
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/admin/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", note, items: lines.map((l) => ({ line_id: l.line_id, id: l.id, qty: l.qty, choiceIds: l.choiceIds })) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error || "Could not save");
    onSaved(`Order #${order.order_no} updated. New total ${money(d.total, cur)}.`, d.total);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Edit order ${order.order_no}`}>
        <h2 className="text-lg font-bold">Edit order #{order.order_no}</h2>
        <p className="text-sm text-muted">Dishes already on the order keep their price. Totals, discount and delivery fee are recalculated.</p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {lines.map((l) => (
            <li key={l.key} className="flex items-center gap-2 p-2 text-sm" data-testid="edit-line">
              <span className="min-w-0 flex-1">
                <b>{l.name}</b>{!l.line_id && <span className="ms-1 rounded bg-green-100 px-1 text-xs text-green-800">new</span>}
                {l.options.length > 0 && <span className="block text-xs text-muted">{optionsText(l.options)}</span>}
                <span className="block text-xs text-muted">{money(l.unit, cur)} each</span>
              </span>
              <div className="flex items-center overflow-hidden rounded-lg border border-line">
                <button type="button" className="px-2.5 py-1" onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Less ${l.name}`}>−</button>
                <span className="w-6 text-center font-semibold">{l.qty}</span>
                <button type="button" className="px-2.5 py-1" onClick={() => setQty(l.key, l.qty + 1)} aria-label={`More ${l.name}`}>+</button>
              </div>
              <span className="w-20 text-right">{money(l.unit * l.qty, cur)}</span>
            </li>
          ))}
          {lines.length === 0 && <li className="p-3 text-sm text-muted">No dishes.</li>}
        </ul>
        <select className="input" value="" onChange={(e) => addDish(e.target.value)} aria-label="Add a dish">
          <option value="">+ Add a dish…</option>
          {menu.map((m) => <option key={m.id} value={m.id}>{m.name} — {money(m.price, cur)}{hasOpts(m) ? " (options)" : ""}</option>)}
        </select>
        <input className="input" placeholder="Reason (optional), e.g. customer called" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Edit reason" />
        <div className="flex justify-between font-semibold"><span>Dishes</span><span data-testid="edit-subtotal">{money(subtotal, cur)}</span></div>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="flex gap-2">
          <span className="flex-1" />
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
      {picking && (
        <div onClick={(e) => e.stopPropagation()}>
          <OptionsSheet item={picking} currency={cur!} onClose={() => setPicking(null)}
            onAdd={(choiceIds, labels, unit, qty) => {
              const g = picking.option_groups;
              const options: PickedOption[] = choiceIds.map((cid) => {
                const grp = g.find((x) => x.choices.some((c) => c.id === cid))!;
                const ch = grp.choices.find((c) => c.id === cid)!;
                return { group: grp.name, name: ch.name, price: ch.price ?? 0 };
              });
              void labels;
              setLines((cur) => [...cur, { key: crypto.randomUUID(), id: picking.id, name: picking.name, qty, unit, choiceIds, options }]);
              setPicking(null);
            }} />
        </div>
      )}
    </div>
  );
}
