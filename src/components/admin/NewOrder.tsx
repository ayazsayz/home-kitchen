"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { currencyOf, money, roundMoney } from "@/lib/format";
import { normalisePhone, regionOf, validPhone } from "@/lib/region";
import { optionsText } from "@/lib/options";
import { whatsappLink } from "@/lib/whatsapp";
import OptionsSheet from "@/components/OptionsSheet";
import type { Category, DeliveryZone, MenuItem, PickedOption, Settings } from "@/lib/types";

type Source = "whatsapp" | "phone" | "walkin";
type Line = { key: string; id: string; name: string; qty: number; unit: number; choiceIds: string[]; options: PickedOption[] };
type Known = { orders: number; note: string; blocked: boolean } | null;

const SOURCES: [Source, string][] = [["whatsapp", "💬 WhatsApp"], ["phone", "📞 Phone call"], ["walkin", "🚶 Walk-in"]];

/** Staff enter an order that came in by WhatsApp, phone or at the door. It then flows like any web order. */
export default function NewOrder({ settings, categories, items, zones }: { settings: Settings; categories: Category[]; items: MenuItem[]; zones: DeliveryZone[] }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const cur = currencyOf(settings);
  const [source, setSource] = useState<Source>("whatsapp");
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [form, setForm] = useState({ phone: "", name: "", address: "", zoneId: "", notes: "", promo: "" });
  const [known, setKnown] = useState<Known>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; no: number; total: number; name: string; phone: string; type: "delivery" | "pickup" } | null>(null);

  const zone = zones.find((z) => z.id === form.zoneId);
  const fee = type === "delivery" ? (zones.length ? zone?.fee ?? 0 : Number(settings.delivery_fee) || 0) : 0;
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.unit * l.qty, 0), cur.decimals ?? 2);
  const hasOpts = (m: MenuItem) => m.option_groups?.some((g) => g.choices.length > 0);
  const shown = items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";

  /** Fill in a returning customer's details from their last order. */
  async function lookup() {
    const phone = normalisePhone(form.phone, settings.phone_country_code);
    if (!validPhone(phone)) return setKnown(null);
    const [{ data: last, count }, { data: note }, { data: blocked }] = await Promise.all([
      db.from("orders").select("customer_name, address, zone_name, order_type", { count: "exact" }).eq("customer_phone", phone)
        .not("status", "in", "(rejected,pending_payment)").order("created_at", { ascending: false }).limit(1),
      db.from("customer_notes").select("note").eq("phone", phone).maybeSingle(),
      db.from("blocked_phones").select("phone").eq("phone", phone).maybeSingle(),
    ]);
    const prev = last?.[0];
    if (prev) {
      setForm((f) => ({
        ...f,
        name: f.name || prev.customer_name,
        address: f.address || prev.address,
        zoneId: f.zoneId || zones.find((z) => z.name === prev.zone_name)?.id || "",
      }));
    }
    setKnown({ orders: count ?? 0, note: note?.note ?? "", blocked: !!blocked });
  }

  function add(m: MenuItem) {
    if (hasOpts(m)) return setPicking(m);
    const same = lines.find((l) => l.id === m.id && !l.choiceIds.length);
    if (same) return setLines((cur) => cur.map((l) => (l.key === same.key ? { ...l, qty: l.qty + 1 } : l)));
    setLines((cur) => [...cur, { key: crypto.randomUUID(), id: m.id, name: m.name, qty: 1, unit: m.price, choiceIds: [], options: [] }]);
  }
  const setQty = (key: string, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((l) => l.key !== key) : cur.map((l) => (l.key === key ? { ...l, qty } : l))));

  async function place(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!lines.length) return setErr("Add at least one dish");
    if (type === "delivery" && zones.length && !zone) return setErr("Choose the delivery area");
    setBusy(true);
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        order_type: type,
        customer_name: form.name,
        customer_phone: form.phone,
        address: form.address,
        zone_id: type === "delivery" && zones.length ? form.zoneId : undefined,
        notes: form.notes,
        payment_method: "cod",
        promo_code: form.promo.trim() || undefined,
        items: lines.map((l) => ({ id: l.id, qty: l.qty, choiceIds: l.choiceIds })),
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error || "Could not place the order");
    const { data: row } = await db.from("orders").select("total").eq("id", d.id).single();
    setDone({ id: d.id, no: d.order_no, total: Number(row?.total ?? subtotal + fee), name: form.name, phone: normalisePhone(form.phone, settings.phone_country_code), type });
  }

  function reset() {
    setDone(null);
    setLines([]);
    setKnown(null);
    setForm({ phone: "", name: "", address: "", zoneId: "", notes: "", promo: "" });
  }

  if (done) {
    const link = `${window.location.origin}/order/${done.id}`;
    const msg = `Hi ${done.name.split(" ")[0]}, thanks for your order! 🙏 Order #${done.no} from ${settings.name} — total ${money(done.total, cur)}${done.type === "delivery" ? " (cash on delivery)" : " (pay on pickup)"}. Track it here: ${link}`;
    return (
      <div className="mx-auto max-w-md space-y-4 py-6 text-center" data-testid="new-order-done">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold">Order #{done.no} placed</h1>
        <p className="text-muted">Total {money(done.total, cur)}. It&apos;s on the Orders screen now (and prints if auto-print is on).</p>
        <p className="rounded-xl bg-cream px-3 py-2 text-sm" data-testid="done-type">
          {done.type === "delivery"
            ? "🛵 Delivery — it appears on the drivers' Deliveries screen once the kitchen marks it Ready."
            : "🏃 Pickup — the customer collects it, so it won't go to drivers."}
        </p>
        <a className="btn w-full bg-[#25D366] hover:bg-[#1da851]" href={whatsappLink(done.phone, msg)} target="_blank" rel="noreferrer">
          💬 Send confirmation & tracking link
        </a>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={reset}>+ Another order</button>
          <Link href="/admin" className="btn-ghost flex-1">Go to Orders</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={place} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New order</h1>
          <Link href="/admin" className="text-sm text-brand">← Orders</Link>
        </div>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Order came in by">
          {SOURCES.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={source === k}
              onClick={() => { setSource(k); setType(k === "walkin" ? "pickup" : "delivery"); }}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${source === k ? "border-brand bg-brand/10 text-brand-dark" : "border-line bg-paper"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="card space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="no-phone">Mobile number</label>
              <input id="no-phone" className="input" inputMode="tel" required placeholder={regionOf(settings.country)?.mobileExample} value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={lookup} />
            </div>
            <div>
              <label className="label" htmlFor="no-name">Name</label>
              <input id="no-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          {known && (
            <div className="space-y-1 text-sm" data-testid="known-customer">
              <p className={known.orders ? "text-ok" : "text-muted"}>{known.orders ? `✓ Returning customer · ${known.orders} order${known.orders > 1 ? "s" : ""} — details filled in` : "🆕 New customer"}</p>
              {known.note && <p className="rounded-lg bg-amber-100 px-2 py-1 font-medium">📌 {known.note}</p>}
              {known.blocked && <p className="rounded-lg bg-red-100 px-2 py-1 font-medium text-red-800">🚫 This number is blocked for online orders.</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {(["delivery", "pickup"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setType(k)}
                className={`rounded-xl border px-3 py-2 font-medium ${type === k ? "border-brand bg-brand/10 text-brand-dark" : "border-line bg-paper"}`}>
                {k === "delivery" ? "🛵 Delivery" : "🏃 Pickup"}
              </button>
            ))}
          </div>
          {type === "delivery" && (
            <>
              {zones.length > 0 && (
                <div>
                  <label className="label" htmlFor="no-zone">Area</label>
                  <select id="no-zone" className="input" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                    <option value="">Choose area…</option>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.fee > 0 ? money(z.fee, cur) : "free"}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label" htmlFor="no-address">Address</label>
                <textarea id="no-address" className="input" rows={2} required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
            <div>
              <label className="label" htmlFor="no-notes">Notes</label>
              <input id="no-notes" className="input" placeholder="Less spicy, ring the bell…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="no-promo">Promo code</label>
              <input id="no-promo" className="input uppercase" value={form.promo} onChange={(e) => setForm({ ...form, promo: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card space-y-2 p-4">
          <input className="input" placeholder="🔍 Find a dish" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a dish" />
          <ul className="grid max-h-[26rem] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {shown.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => add(m)} aria-label={`Add ${m.name}`}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-left hover:border-brand">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="text-xs text-muted">{catName(m.category_id)}{hasOpts(m) ? " · options" : ""}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{money(m.price, cur)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <aside className="card h-fit space-y-3 p-4 lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Order</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${type === "delivery" ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-900"}`} data-testid="order-type-pill">
            {type === "delivery" ? "🛵 Delivery" : "🏃 Pickup"}
          </span>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-muted">Tap dishes to add them.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-2 text-sm" data-testid="new-order-line">
                <span className="min-w-0 flex-1">
                  <b>{l.name}</b>
                  {l.options.length > 0 && <span className="block text-xs text-muted">{optionsText(l.options)}</span>}
                </span>
                <div className="flex items-center overflow-hidden rounded-lg border border-line">
                  <button type="button" className="px-2.5 py-1" onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Less ${l.name}`}>−</button>
                  <span className="w-6 text-center font-semibold">{l.qty}</span>
                  <button type="button" className="px-2.5 py-1" onClick={() => setQty(l.key, l.qty + 1)} aria-label={`More ${l.name}`}>+</button>
                </div>
                <span className="w-20 text-right">{money(l.unit * l.qty, cur)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-1 border-t border-line pt-2 text-sm">
          <div className="flex justify-between"><span>Dishes</span><span>{money(subtotal, cur)}</span></div>
          {type === "delivery" && <div className="flex justify-between text-muted"><span>Delivery{zone ? ` · ${zone.name}` : ""}</span><span>{money(fee, cur)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>Total (cash)</span><span data-testid="new-order-total">{money(subtotal + fee, cur)}</span></div>
          <p className="text-xs text-muted">Loyalty rewards and promo codes are applied when you place it.</p>
        </div>
        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button className="btn w-full py-3" disabled={busy}>{busy ? "Placing…" : "Place order"}</button>
      </aside>

      {picking && (
        <OptionsSheet item={picking} currency={cur} onClose={() => setPicking(null)}
          onAdd={(choiceIds, _labels, unit, qty) => {
            const options: PickedOption[] = choiceIds.map((cid) => {
              const g = picking.option_groups.find((x) => x.choices.some((c) => c.id === cid))!;
              const c = g.choices.find((x) => x.id === cid)!;
              return { group: g.name, name: c.name, price: c.price ?? 0 };
            });
            setLines((cur) => [...cur, { key: crypto.randomUUID(), id: picking.id, name: picking.name, qty, unit, choiceIds, options }]);
            setPicking(null);
          }} />
      )}
    </form>
  );
}
