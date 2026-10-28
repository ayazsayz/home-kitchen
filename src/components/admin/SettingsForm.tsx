"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { normalise } from "@/lib/format";
import { printOrder } from "@/lib/ticket";
import { DEFAULT_TEMPLATES, NOTIFY_STATUSES, PLACEHOLDERS } from "@/lib/whatsapp";
import { STATUS_LABEL, type Order, type OrderStatus, type Settings } from "@/lib/types";

export default function SettingsForm({ paymentProvider }: { paymentProvider: string | null }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    db.from("settings").select("*").eq("id", 1).single().then(({ data }) => data && setS({ ...(normalise(data) as Settings), whatsapp_templates: data.whatsapp_templates ?? {}, card_enabled: !!data.card_enabled }));
  }, [db]);

  if (!s) return <p className="text-muted">Loading…</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const { error } = await db
      .from("settings")
      .update({
        name: s.name,
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

      <div className="card space-y-3 p-4">
        <Field label="Restaurant name"><input className="input" value={s.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Phone (shown to customers)"><input className="input" value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Address (printed on receipt)"><input className="input" value={s.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Message when closed"><input className="input" value={s.closed_message} onChange={(e) => set("closed_message", e.target.value)} /></Field>
      </div>

      <div className="card grid grid-cols-2 gap-3 p-4">
        <Field label="Delivery fee (if no areas)"><input className="input" type="number" min={0} step="0.5" value={s.delivery_fee} onChange={(e) => set("delivery_fee", e.target.value as unknown as number)} /></Field>
        <Field label="Minimum order (AED)"><input className="input" type="number" min={0} step="1" value={s.min_order} onChange={(e) => set("min_order", e.target.value as unknown as number)} /></Field>
        <Field label="VAT % (0 if not registered)"><input className="input" type="number" min={0} step="0.01" value={s.vat_percent} onChange={(e) => set("vat_percent", e.target.value as unknown as number)} /></Field>
        <Field label="TRN"><input className="input" value={s.trn} onChange={(e) => set("trn", e.target.value)} /></Field>
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

      <div className="flex items-center gap-3">
        <button className="btn">Save</button>
        <button type="button" className="btn-ghost" onClick={testPrint}>🖨 Test print</button>
        {msg && <span className="text-sm text-ok">{msg}</span>}
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
