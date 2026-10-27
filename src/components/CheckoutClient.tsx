"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { money } from "@/lib/format";
import type { Settings } from "@/lib/types";
import { Stepper } from "./MenuClient";

const SAVED = "hk_customer_v1";

export default function CheckoutClient({ settings }: { settings: Settings }) {
  const cart = useCart();
  const router = useRouter();
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Remember returning customers' details on this device.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVED) || "null");
      if (s) setForm((f) => ({ ...f, name: s.name ?? "", phone: s.phone ?? "", address: s.address ?? "" }));
    } catch {}
  }, []);

  const fee = type === "delivery" ? settings.delivery_fee : 0;
  const total = cart.subtotal + fee;
  const belowMin = settings.min_order > 0 && cart.subtotal < settings.min_order;
  const c = settings.currency;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
          notes: form.notes,
          items: cart.lines.map((l) => ({ id: l.id, qty: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not place order");
      try {
        localStorage.setItem(SAVED, JSON.stringify({ name: form.name, phone: form.phone, address: form.address }));
      } catch {}
      cart.clear();
      router.push(`/order/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (cart.ready && cart.count === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <Link href="/" className="btn mt-4">
          Back to menu
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Checkout</h1>
        <Link href="/" className="text-sm text-brand">
          ← Menu
        </Link>
      </div>

      <section className="card divide-y divide-line">
        {cart.lines.map((l) => (
          <div key={l.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="font-medium">{l.name}</div>
              <div className="text-sm text-muted">{money(l.price, c)}</div>
            </div>
            <Stepper qty={l.qty} onChange={(n) => cart.setQty(l.id, n)} />
            <div className="w-24 text-right font-medium">{money(l.price * l.qty, c)}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        {(["delivery", "pickup"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setType(t)}
            className={`rounded-xl border px-4 py-3 font-medium capitalize ${
              type === t ? "border-brand bg-brand/10 text-brand-dark" : "border-line bg-paper"
            }`}
          >
            {t}
          </button>
        ))}
      </section>

      <section className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
          <input id="phone" className="input" required inputMode="tel" placeholder="05X XXX XXXX"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        {type === "delivery" && (
          <div>
            <label className="label" htmlFor="address">Delivery address</label>
            <textarea id="address" className="input" rows={3} required
              placeholder="Building, flat, area, landmark"
              value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="notes">Notes (optional)</label>
          <input id="notes" className="input" placeholder="Less spicy, no onions…"
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </section>

      <section className="card space-y-1 p-4">
        <Row label="Subtotal" value={money(cart.subtotal, c)} />
        {type === "delivery" && <Row label="Delivery" value={money(fee, c)} />}
        <Row label="Total (cash on delivery)" value={money(total, c)} strong />
        {settings.vat_percent > 0 && (
          <p className="pt-1 text-xs text-muted">Prices include {settings.vat_percent}% VAT.</p>
        )}
      </section>

      {belowMin && (
        <p className="text-sm text-brand-dark">Minimum order is {money(settings.min_order, c)}.</p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button className="btn w-full py-3 text-lg" disabled={busy || belowMin || !settings.is_open}>
        {busy ? "Placing order…" : `Place order · ${money(total, c)}`}
      </button>
    </form>
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
