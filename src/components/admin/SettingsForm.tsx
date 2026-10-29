"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { CURRENCIES, currencyOf, money, normalise } from "@/lib/format";
import { printOrder } from "@/lib/ticket";
import { DEFAULT_TEMPLATES, NOTIFY_STATUSES, PLACEHOLDERS } from "@/lib/whatsapp";
import { STATUS_LABEL, type Order, type OrderStatus, type Settings } from "@/lib/types";
import { withSettingDefaults } from "@/lib/settings";
import HoursSettings from "./HoursSettings";

export default function SettingsForm({ paymentProvider }: { paymentProvider: string | null }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    db.from("settings").select("*").eq("id", 1).single().then(({ data }) => data && setS(withSettingDefaults(normalise(data))));
  }, [db]);

  if (!s) return <p className="text-muted">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const code = (s.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      setMsg("Currency code must be 3 letters, e.g. AED");
      return;
    }
    const { error } = await db
      .from("settings")
      .update({
        name: s.name,
        currency: code,
        currency_symbol: (s.currency_symbol || "").trim().slice(0, 8),
        currency_decimals: [0, 2, 3].includes(Number(s.currency_decimals)) ? Number(s.currency_decimals) : 2,
        phone: s.phone,
        address: s.address,
        delivery_fee: Number(s.delivery_fee) || 0,
        min_order: Number(s.min_order) || 0,
        vat_percent: Number(s.vat_percent) || 0,
        trn: s.trn,
        is_open: s.is_open,
        closed_message: s.closed_message,
        whatsapp_templates: s.whatsapp_templates,
        card_enabled: s.card_enabled,
        hours: s.hours,
        auto_hours: s.auto_hours,
        allow_asap: s.allow_asap,
        allow_scheduled: s.allow_scheduled,
        slot_minutes: Math.max(10, Math.round(s.slot_minutes) || 30),
        slot_capacity: Math.max(0, Math.round(s.slot_capacity) || 0),
        lead_minutes: Math.max(0, Math.round(s.lead_minutes) || 0),
        days_ahead: Math.min(14, Math.max(0, Math.round(s.days_ahead) || 0)),
        require_pin: s.require_pin,
        map_center_lat: Number(s.map_center_lat) || 25.2048,
        map_center_lng: Number(s.map_center_lng) || 55.2708,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setMsg(error ? error.message : "Saved");
    setTimeout(() => setMsg(""), 2500);
  }

  function testPrint() {
    if (!s) return;
    const sample: Order = {
      id: "test", order_no: 0, status: "new", order_type: "delivery",
      customer_name: "Test Customer", customer_phone: "+971500000000", address: "Test address",
      notes: "Test print", subtotal: 32, delivery_fee: Number(s.delivery_fee) || 0,
      total: 32 + (Number(s.delivery_fee) || 0), vat_percent: Number(s.vat_percent) || 0,
      payment_method: "cod", payment_status: "unpaid", zone_name: "Al Nahda", printed_at: null, created_at: new Date().toISOString(),
      scheduled_for: new Date(Date.now() + 3 * 3600e3).toISOString(), promo_code: "WELCOME10", discount: 3.2,
      location_lat: Number(s.map_center_lat) || 25.2048, location_lng: Number(s.map_center_lng) || 55.2708,
      order_items: [
        { id: "a", order_id: "test", menu_item_id: null, name: "Chicken Biryani", unit_price: 28, qty: 1, line_total: 28, options: [{ group: "Spice level", name: "Medium", price: 0 }] },
        { id: "b", order_id: "test", menu_item_id: null, name: "Garlic Naan", unit_price: 4, qty: 1, line_total: 4, options: [] },
      ],
    };
    printOrder(sample, s, "both");
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>

      <label className={`card flex items-center justify-between p-4 ${s.is_open ? "border-ok" : "border-brand"}`}>
        <div>
          <div className="font-semibold">{s.is_open ? "Open for orders" : "Closed"}</div>
          <div className="text-sm text-muted">Turn off when you stop taking orders for the day.</div>
        </div>
        <input type="checkbox" className="h-6 w-6 accent-ok" checked={s.is_open} onChange={(e) => set("is_open", e.target.checked)} />
      </label>

      <HoursSettings s={s} set={set} />

      <div className="card space-y-3 p-4">
        <Field label="Restaurant name"><input className="input" value={s.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Phone (shown to customers)"><input className="input" value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Address (printed on receipt)"><input className="input" value={s.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Message when closed"><input className="input" value={s.closed_message} onChange={(e) => set("closed_message", e.target.value)} /></Field>
      </div>

      <CurrencySettings s={s} setS={setS} />

      <div className="card grid grid-cols-2 gap-3 p-4">
        <Field label="Delivery fee (if no areas)"><input className="input" type="number" min={0} step="any" value={s.delivery_fee} onChange={(e) => set("delivery_fee", e.target.value as unknown as number)} /></Field>
        <Field label="Minimum order"><input className="input" type="number" min={0} step="any" value={s.min_order} onChange={(e) => set("min_order", e.target.value as unknown as number)} /></Field>
        <Field label="VAT % (0 if not registered)"><input className="input" type="number" min={0} step="0.01" value={s.vat_percent} onChange={(e) => set("vat_percent", e.target.value as unknown as number)} /></Field>
        <Field label="TRN"><input className="input" value={s.trn} onChange={(e) => set("trn", e.target.value)} /></Field>
      </div>

      <div className="card space-y-3 p-4">
        <div className="font-semibold">Map pin at checkout</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-ok" checked={s.require_pin} onChange={(e) => set("require_pin", e.target.checked)} />
          Require customers to pin their location for delivery (otherwise optional)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Map starts at (latitude)"><input className="input" type="number" step="any" value={s.map_center_lat} onChange={(e) => set("map_center_lat", e.target.value as unknown as number)} /></Field>
          <Field label="Longitude"><input className="input" type="number" step="any" value={s.map_center_lng} onChange={(e) => set("map_center_lng", e.target.value as unknown as number)} /></Field>
        </div>
        <button type="button" className="text-sm text-brand" onClick={() =>
          navigator.geolocation?.getCurrentPosition((p) => setS((cur) => cur && { ...cur, map_center_lat: +p.coords.latitude.toFixed(5), map_center_lng: +p.coords.longitude.toFixed(5) }))
        }>
          🎯 Use this device&apos;s location as the map start point
        </button>
      </div>

      <div className="card space-y-3 p-4">
        <div>
          <div className="font-semibold">Card payments</div>
          {paymentProvider ? (
            <p className="text-sm text-muted">Connected to <b className="capitalize">{paymentProvider}</b>.</p>
          ) : (
            <p className="text-sm text-muted">
              Not set up yet. Add the payment provider keys in Vercel (see README), then turn this on.
            </p>
          )}
        </div>
        <label className={`flex items-center gap-2 ${paymentProvider ? "" : "opacity-50"}`}>
          <input type="checkbox" className="h-4 w-4 accent-ok" disabled={!paymentProvider} checked={s.card_enabled}
            onChange={(e) => set("card_enabled", e.target.checked)} />
          Let customers pay by card at checkout
        </label>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">WhatsApp messages</summary>
        <p className="mt-2 text-sm text-muted">
          Sent with one tap from the Orders screen. Leave a box empty to use the default. You can use{" "}
          {PLACEHOLDERS.map((p) => <code key={p} className="mr-1 rounded bg-cream px-1">{p}</code>)}
        </p>
        <div className="mt-3 space-y-3">
          {(["new", ...NOTIFY_STATUSES] as OrderStatus[]).map((st) => (
            <Field key={st} label={STATUS_LABEL[st]}>
              <textarea className="input text-sm" rows={2}
                placeholder={DEFAULT_TEMPLATES[st as keyof typeof DEFAULT_TEMPLATES]}
                value={s.whatsapp_templates[st] ?? ""}
                onChange={(e) => set("whatsapp_templates", { ...s.whatsapp_templates, [st]: e.target.value })} />
            </Field>
          ))}
        </div>
      </details>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-line bg-cream/95 px-1 py-3 backdrop-blur">
        <button className="btn">Save</button>
        <button type="button" className="btn-ghost" onClick={testPrint}>🖨 Test print</button>
        {msg && <span className={`text-sm ${msg === "Saved" ? "text-ok" : "text-red-700"}`}>{msg}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function CurrencySettings({ s, setS }: { s: Settings; setS: (fn: (cur: Settings | null) => Settings | null) => void }) {
  const isKnown = CURRENCIES.some((c) => c.code === s.currency);
  const [other, setOther] = useState(!isKnown);
  const patch = (p: Partial<Settings>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const preview = currencyOf(s);
  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="font-semibold">Currency</div>
        <p className="text-sm text-muted">Changing it does not convert your prices — update menu prices, fees and promo amounts yourself.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="label" htmlFor="currency">Currency</label>
          <select
            id="currency"
            className="input"
            value={other ? "__other" : s.currency}
            onChange={(e) => {
              if (e.target.value === "__other") return setOther(true);
              const c = CURRENCIES.find((x) => x.code === e.target.value)!;
              setOther(false);
              patch({ currency: c.code, currency_symbol: "", currency_decimals: c.decimals });
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
            <option value="__other">Other…</option>
          </select>
        </div>
        {other && (
          <div>
            <label className="label" htmlFor="currency-code">Code</label>
            <input id="currency-code" className="input uppercase" maxLength={3} placeholder="e.g. NPR" value={s.currency}
              onChange={(e) => patch({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="currency-symbol">Symbol shown</label>
          <input id="currency-symbol" className="input" maxLength={8} placeholder={currencyOf({ currency: s.currency }).symbol}
            value={s.currency_symbol} onChange={(e) => patch({ currency_symbol: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="currency-decimals">Decimals</label>
          <select id="currency-decimals" className="input" value={s.currency_decimals}
            onChange={(e) => patch({ currency_decimals: Number(e.target.value) })}>
            <option value={0}>0 (1,250)</option>
            <option value={2}>2 (1,250.00)</option>
            <option value={3}>3 (1,250.000)</option>
          </select>
        </div>
      </div>
      <p className="text-sm">
        Preview: <b data-testid="currency-preview">{money(1250.5, preview)}</b>
      </p>
    </div>
  );
}
