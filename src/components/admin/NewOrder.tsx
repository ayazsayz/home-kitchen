"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { currencyOf, money, roundMoney } from "@/lib/format";
import { normalisePhone, regionOf, validPhone } from "@/lib/region";
import { optionsText } from "@/lib/options";
import { whatsappLink } from "@/lib/whatsapp";
import OptionsSheet from "@/components/OptionsSheet";
import { emojiFor } from "@/components/MenuClient";
import type { Category, DeliveryZone, MenuItem, PickedOption, Settings } from "@/lib/types";

type Source = "whatsapp" | "phone" | "walkin";
type Line = { key: string; id: string; name: string; qty: number; unit: number; choiceIds: string[]; options: PickedOption[] };
type Known = { orders: number; note: string; blocked: boolean } | null;
type Form = { phone: string; name: string; address: string; zoneId: string; notes: string; promo: string };
type Held = { key: string; label: string; count: number; at: string; source: Source; type: "delivery" | "pickup"; form: Form; lines: Line[] };

const POPULAR = "__popular";
const ALL = "__all";
const HELD_KEY = "hk_held_orders_v1";

const SOURCES: [Source, string][] = [["whatsapp", "💬 WhatsApp"], ["phone", "📞 Phone"], ["walkin", "🚶 Walk-in"]];

/**
 * Counter POS: staff enter an order that came in by WhatsApp, phone or at the door — dishes first (picture tiles by
 * category), then customer and delivery in the order panel. It then flows like any web order.
 */
export default function NewOrder({ settings, categories, items, zones, popular = [] }: { settings: Settings; categories: Category[]; items: MenuItem[]; zones: DeliveryZone[]; popular?: string[] }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const cur = currencyOf(settings);
  const [source, setSource] = useState<Source>("whatsapp");
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [form, setForm] = useState<Form>({ phone: "", name: "", address: "", zoneId: "", notes: "", promo: "" });
  const [known, setKnown] = useState<Known>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(ALL);
  const [held, setHeld] = useState<Held[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; no: number; total: number; name: string; phone: string; type: "delivery" | "pickup" } | null>(null);

  const zone = zones.find((z) => z.id === form.zoneId);
  const fee = type === "delivery" ? (zones.length ? zone?.fee ?? 0 : Number(settings.delivery_fee) || 0) : 0;
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.unit * l.qty, 0), cur.decimals ?? 2);
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";
  const hasOpts = (m: MenuItem) => m.option_groups?.some((g) => g.choices.length > 0);
  const term = q.trim().toLowerCase();
  const shown = term
    ? items.filter((i) => i.name.toLowerCase().includes(term) || catName(i.category_id).toLowerCase().includes(term))
    : cat === POPULAR
      ? popular.map((id) => items.find((i) => i.id === id)).filter((i): i is MenuItem => !!i)
      : cat === ALL
        ? items
        : items.filter((i) => i.category_id === cat);

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

  // "/" jumps to the dish search (unless typing in a field)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // Orders on hold (e.g. a caller who is still deciding) — kept on this device
  useEffect(() => {
    try {
      setHeld(JSON.parse(localStorage.getItem(HELD_KEY) || "[]"));
    } catch {}
  }, []);
  const saveHeld = (list: Held[]) => {
    setHeld(list);
    try {
      localStorage.setItem(HELD_KEY, JSON.stringify(list));
    } catch {}
  };
  const snapshot = (): Held => ({
    key: crypto.randomUUID(),
    label: form.name.trim().split(" ")[0] || form.phone.trim() || `Order ${held.length + 1}`,
    count: lines.reduce((n, l) => n + l.qty, 0),
    at: new Date().toISOString(),
    source, type, form, lines,
  });
  function hold() {
    if (!lines.length) return;
    saveHeld([...held, snapshot()]);
    reset();
  }
  function resume(key: string) {
    const h = held.find((x) => x.key === key);
    if (!h) return;
    const rest = held.filter((x) => x.key !== key);
    saveHeld(lines.length ? [...rest, snapshot()] : rest); // the order on screen goes on hold in its place
    setSource(h.source);
    setType(h.type);
    setForm(h.form);
    setLines(h.lines);
    setKnown(null);
    setErr("");
  }
  const dropHeld = (key: string) => saveHeld(held.filter((x) => x.key !== key));

  function reset() {
    setDone(null);
    setLines([]);
    setKnown(null);
    setForm({ phone: "", name: "", address: "", zoneId: "", notes: "", promo: "" });
    setErr("");
    setQ("");
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

  const shownQty = (id: string) => lines.filter((l) => l.id === id).reduce((n, l) => n + l.qty, 0);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = subtotal + fee;
  const cats = [
    ...(popular.length ? [{ id: POPULAR, name: "Popular", n: popular.length }] : []),
    { id: ALL, name: "All dishes", n: items.length },
    ...categories.map((c) => ({ id: c.id, name: c.name, n: items.filter((i) => i.category_id === c.id).length })).filter((c) => c.n > 0),
  ];

  return (
    <form onSubmit={place} className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[1600px] -translate-x-1/2 pb-24 lg:pb-0" data-testid="pos">
      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[11rem_minmax(0,1fr)_25rem]">
        {/* ---------- categories ---------- */}
        <nav aria-label="Categories" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto lg:pe-1">
          {cats.map((c) => (
            <button key={c.id} type="button" onClick={() => { setCat(c.id); setQ(""); }} aria-pressed={cat === c.id && !q}
              className={`shrink-0 rounded-xl px-3 py-2.5 text-left text-sm font-bold lg:min-h-14 ${cat === c.id && !q ? "bg-brand text-white" : "border border-line bg-paper hover:border-brand"}`}>
              {c.name}
              <span className={`block text-xs font-medium ${cat === c.id && !q ? "text-white/80" : "text-muted"}`}>{c.n} item{c.n === 1 ? "" : "s"}</span>
            </button>
          ))}
        </nav>

        {/* ---------- dish tiles ---------- */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">New order</h1>
            <div className="relative min-w-0 flex-1 basis-60">
              <input ref={search} className="input pe-10" placeholder="Find a dish — press / " value={q} aria-label="Find a dish"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (shown[0]) { add(shown[0]); setQ(""); }
                  }
                  if (e.key === "Escape") setQ("");
                }} />
              {q && <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 px-2 text-muted" onClick={() => setQ("")} aria-label="Clear search">✕</button>}
            </div>
            <Link href="/admin" className="text-sm text-brand">← Orders</Link>
          </div>
          <p className="-mt-1 text-xs text-muted">{q ? `${shown.length} match${shown.length === 1 ? "" : "es"} · Enter adds the first` : `${cats.find((c) => c.id === cat)?.name ?? ""} · tap a dish to add it`}</p>
          <ul className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 xl:grid-cols-4 lg:min-h-0 lg:overflow-y-auto lg:pe-1" data-testid="dish-tiles">
            {shown.map((m) => {
              const n = shownQty(m.id);
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => add(m)} aria-label={`Add ${m.name}`}
                    className={`group flex w-full flex-col overflow-hidden rounded-2xl border-2 bg-paper text-left shadow-sm transition active:scale-[.98] ${n ? "border-brand" : "border-line hover:border-brand/60"}`}>
                    <span className="relative flex h-28 w-full items-center justify-center bg-cream text-5xl">
                      {m.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span aria-hidden="true">{emojiFor(m.name, catName(m.category_id))}</span>
                      )}
                      {n > 0 && <span className="absolute end-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-brand px-2 text-sm font-extrabold text-white shadow" data-testid="tile-qty">{n}</span>}
                      {hasOpts(m) && <span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-muted">Options</span>}
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="line-clamp-2 text-sm font-extrabold leading-tight">{m.name}</span>
                      <span className="text-xs text-muted">{catName(m.category_id)}</span>
                      <span className="mt-auto text-[15px] font-bold text-brand">{money(m.price, cur)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="col-span-full py-10 text-center text-muted">No dish matches &quot;{q}&quot;.</li>}
          </ul>
        </section>

        {/* ---------- the order ---------- */}
        <aside id="order-panel" className="card flex min-h-0 flex-col overflow-hidden">
          <div className="space-y-3 border-b border-line p-3">
            {held.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="held-orders">
                <span className="text-muted">On hold:</span>
                {held.map((h) => (
                  <span key={h.key} className="inline-flex items-center overflow-hidden rounded-full border border-line bg-amber-50">
                    <button type="button" className="px-2.5 py-1 font-semibold" onClick={() => resume(h.key)}>{h.label} · {h.count}</button>
                    <button type="button" className="px-1.5 py-1 text-muted" onClick={() => dropHeld(h.key)} aria-label={`Remove ${h.label} from hold`}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Order came in by">
              {SOURCES.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={source === k}
                  onClick={() => { setSource(k); setType(k === "walkin" ? "pickup" : "delivery"); }}
                  className={`min-h-10 rounded-lg border px-1 text-sm font-semibold ${source === k ? "border-brand bg-brand/10 text-brand-dark" : "border-line bg-paper"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["delivery", "pickup"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setType(k)} aria-pressed={type === k}
                  className={`min-h-10 rounded-lg border px-2 text-sm font-semibold ${type === k ? "border-ink bg-ink text-white" : "border-line bg-paper"}`}>
                  {k === "delivery" ? "🛵 Delivery" : "🏃 Pickup"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label !mb-0.5 !text-xs" htmlFor="no-phone">Mobile number</label>
                <input id="no-phone" className="input !py-2" inputMode="tel" required placeholder={regionOf(settings.country)?.mobileExample} value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={lookup} />
              </div>
              <div>
                <label className="label !mb-0.5 !text-xs" htmlFor="no-name">Name</label>
                <input id="no-name" className="input !py-2" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            {known && (
              <div className="space-y-1 text-xs" data-testid="known-customer">
                <p className={known.orders ? "font-semibold text-ok" : "text-muted"}>{known.orders ? `✓ Returning customer · ${known.orders} order${known.orders > 1 ? "s" : ""} — details filled in` : "🆕 New customer"}</p>
                {known.note && <p className="rounded-lg bg-amber-100 px-2 py-1 font-medium">📌 {known.note}</p>}
                {known.blocked && <p className="rounded-lg bg-red-100 px-2 py-1 font-medium text-red-800">🚫 This number is blocked for online orders.</p>}
              </div>
            )}
            {type === "delivery" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,10rem)_1fr] lg:grid-cols-[minmax(0,9rem)_1fr]">
                {zones.length > 0 && (
                  <div>
                    <label className="label !mb-0.5 !text-xs" htmlFor="no-zone">Area</label>
                    <select id="no-zone" className="input !py-2" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
                      <option value="">Choose…</option>
                      {zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.fee > 0 ? money(z.fee, cur) : "free"}</option>)}
                    </select>
                  </div>
                )}
                <div className={zones.length ? "" : "sm:col-span-2 lg:col-span-2"}>
                  <label className="label !mb-0.5 !text-xs" htmlFor="no-address">Address</label>
                  <input id="no-address" className="input !py-2" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </div>
            )}
          </div>

          <div className="min-h-[7rem] flex-1 overflow-y-auto px-3">
            <div className="flex items-center justify-between py-2">
              <h2 className="font-semibold">Order{count ? ` · ${count} item${count > 1 ? "s" : ""}` : ""}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${type === "delivery" ? "bg-sky-100 text-sky-900" : "bg-amber-100 text-amber-900"}`} data-testid="order-type-pill">
                {type === "delivery" ? "🛵 Delivery" : "🏃 Pickup"}
              </span>
            </div>
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Tap dishes on the left to add them.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lines.map((l) => (
                  <li key={l.key} className="flex items-center gap-2 py-2 text-sm" data-testid="new-order-line">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{l.name}</b>
                      {l.options.length > 0 && <span className="block text-xs text-muted">{optionsText(l.options)}</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" className="h-9 w-9 rounded-lg border border-line text-lg" onClick={() => setQty(l.key, l.qty - 1)} aria-label={`Less ${l.name}`}>−</button>
                      <span className="w-6 text-center font-bold">{l.qty}</span>
                      <button type="button" className="h-9 w-9 rounded-lg bg-ink text-lg text-white" onClick={() => setQty(l.key, l.qty + 1)} aria-label={`More ${l.name}`}>+</button>
                    </div>
                    <span className="w-20 text-right font-semibold">{money(l.unit * l.qty, cur)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-line p-3">
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <input id="no-notes" className="input !py-2 text-sm" aria-label="Notes" placeholder="Note: less spicy, ring the bell…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <input id="no-promo" className="input !py-2 text-sm uppercase" aria-label="Promo code" placeholder="Promo" value={form.promo} onChange={(e) => setForm({ ...form, promo: e.target.value })} />
            </div>
            <div className="space-y-0.5 text-sm">
              <div className="flex justify-between text-muted"><span>Dishes</span><span>{money(subtotal, cur)}</span></div>
              {type === "delivery" && <div className="flex justify-between text-muted"><span>Delivery{zone ? ` · ${zone.name}` : ""}</span><span>{money(fee, cur)}</span></div>}
              <div className="flex justify-between pt-1 text-xl font-extrabold"><span>Total (cash)</span><span data-testid="new-order-total">{money(total, cur)}</span></div>
              <p className="text-xs text-muted">Loyalty rewards and promo codes are applied when you place it.</p>
            </div>
            {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <button type="button" className="btn-ghost min-h-14" onClick={hold} disabled={!lines.length}>Hold</button>
              <button className="btn min-h-14 text-base" disabled={busy}>{busy ? "Placing…" : "Place order"}</button>
            </div>
          </div>
        </aside>
      </div>

      {/* phones: jump to the order */}
      {count > 0 && (
        <a href="#order-panel" className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white shadow-lg lg:hidden" data-testid="mobile-cart-bar">
          <span><b>{count}</b> item{count > 1 ? "s" : ""} · {money(total, cur)}</span>
          <span className="font-bold">Review order ↓</span>
        </a>
      )}

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
