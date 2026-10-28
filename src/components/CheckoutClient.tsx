"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import type { DeliveryZone, Settings } from "@/lib/types";
import { Stepper } from "./MenuClient";

const SAVED = "hk_customer_v1";

export default function CheckoutClient({ settings, zones }: { settings: Settings; zones: DeliveryZone[] }) {
  const cart = useCart();
  const router = useRouter();
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [pay, setPay] = useState<"cod" | "card">("cod");
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "", zoneId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Remember returning customers' details on this device.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVED) || "null");
      if (s)
        setForm((f) => ({
          ...f,
          name: s.name ?? "",
          phone: s.phone ?? "",
          address: s.address ?? "",
          zoneId: zones.some((z) => z.id === s.zoneId) ? s.zoneId : "",
        }));
    } catch {}
  }, [zones]);

  const useZones = type === "delivery" && zones.length > 0;
  const zone = zones.find((z) => z.id === form.zoneId);
  const fee = type !== "delivery" ? 0 : useZones ? (zone?.fee ?? 0) : settings.delivery_fee;
  const minOrder = useZones && zone?.min_order != null ? zone.min_order : settings.min_order;
  const total = cart.subtotal + fee;
  const belowMin = minOrder > 0 && cart.subtotal < minOrder;
  const c = settings.currency;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (useZones && !zone) return setError("Please choose your delivery area");
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_type: type,
          customer_name: form.name,
          customer_phone: form.phone,
          address: form.address,
          zone_id: useZones ? form.zoneId : undefined,
          notes: form.notes,
          payment_method: pay,
          items: cart.lines.map((l) => ({ id: l.id, qty: l.qty, choiceIds: l.choiceIds })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place order");
      try {
        localStorage.setItem(
          SAVED,
          JSON.stringify({ name: form.name, phone: form.phone, address: form.address, zoneId: form.zoneId }),
        );
      } catch {}
      cart.clear();
      if (data.redirectUrl) window.location.href = data.redirectUrl;
      else router.push(`/order/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (cart.ready && cart.count === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <Link href="/" className="btn mt-4">Back to menu</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <Link href="/" className="text-sm text-brand">← Menu</Link>
      </div>

      <section className="card divide-y divide-line">
        {cart.lines.map((l) => (
          <div key={l.key} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{l.name}</div>
              {l.optionLabels.length > 0 && <div className="text-sm text-muted">{l.optionLabels.join(", ")}</div>}
              <div className="text-sm text-muted">{money(l.price, c)}</div>
            </div>
            <Stepper qty={l.qty} onChange={(n) => cart.setQty(l.key, n)} />
            <div className="w-24 text-right font-medium">{money(l.price * l.qty, c)}</div>
          </div>
        ))}
      </section>

      <Toggle
        value={type}
        onChange={setType}
        options={[
          ["delivery", "Delivery"],
          ["pickup", "Pickup"],
        ]}
      />

      <section className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Mobile number (WhatsApp)</label>
          <input id="phone" className="input" required inputMode="tel" placeholder="05X XXX XXXX"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        {useZones && (
          <div>
            <label className="label" htmlFor="zone">Delivery area</label>
            <select id="zone" className="input" required value={form.zoneId}
              onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
              <option value="">Choose your area…</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} — {z.fee > 0 ? money(z.fee, c) : "Free delivery"}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">Area not listed? Choose pickup or call us.</p>
          </div>
        )}
        {type === "delivery" && (
          <div>
            <label className="label" htmlFor="address">Delivery address</label>
            <textarea id="address" className="input" rows={3} required placeholder="Building, flat, street, landmark"
              value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="notes">Notes (optional)</label>
          <input id="notes" className="input" placeholder="Less spicy, no onions…"
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </section>

      {settings.card_enabled && (
        <section>
          <h2 className="mb-2 font-semibold">Payment</h2>
          <Toggle
            value={pay}
            onChange={setPay}
            options={[
              ["cod", type === "pickup" ? "Cash on pickup" : "Cash on delivery"],
              ["card", "Pay now by card"],
            ]}
          />
        </section>
      )}

      <section className="card space-y-1 p-4">
        <Row label="Subtotal" value={money(cart.subtotal, c)} />
        {type === "delivery" && (
          <Row label={`Delivery${zone ? ` · ${zone.name}` : ""}`} value={useZones && !zone ? "—" : money(fee, c)} />
        )}
        <Row label={pay === "card" ? "Total" : "Total (pay in cash)"} value={money(total, c)} strong />
        {settings.vat_percent > 0 && <p className="pt-1 text-xs text-muted">Prices include {settings.vat_percent}% VAT.</p>}
      </section>

      {belowMin && <p className="text-sm text-brand-dark">Minimum order{zone ? ` for ${zone.name}` : ""} is {money(minOrder, c)}.</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button className="btn w-full py-3 text-lg" disabled={busy || belowMin || !settings.is_open}>
        {busy ? (pay === "card" ? "Opening payment…" : "Placing order…") : pay === "card" ? `Pay ${money(total, c)}` : `Place order · ${money(total, c)}`}
      </button>
    </form>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([k, label]) => (
        <button
          type="button"
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-xl border px-4 py-3 font-medium ${value === k ? "border-brand bg-brand/10 text-brand-dark" : "border-line bg-paper"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "pt-2 text-lg font-bold" : "text-muted"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
