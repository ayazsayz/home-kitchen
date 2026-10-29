"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { currencyOf, money, roundMoney } from "@/lib/format";
import { fmtWhen } from "@/lib/schedule";
import type { Availability } from "@/lib/data";
import type { DeliveryZone, Settings } from "@/lib/types";
import type { LatLng } from "./MapPicker";
import { Stepper } from "./MenuClient";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-line/50" />,
});

const SAVED = "hk_customer_v1";
type AppliedPromo = { code: string; discount: number; label: string };

export default function CheckoutClient({
  settings,
  availability,
  zones,
  googleMapsKey,
}: {
  settings: Settings;
  availability: Availability;
  zones: DeliveryZone[];
  googleMapsKey: string;
}) {
  const cart = useCart();
  const router = useRouter();
  const [type, setType] = useState<"delivery" | "pickup">("delivery");
  const [pay, setPay] = useState<"cod" | "card">("cod");
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "", zoneId: "" });
  const [when, setWhen] = useState<string>(availability.asap ? "asap" : "");
  const [pin, setPin] = useState<LatLng | null>(null);
  const [showMap, setShowMap] = useState(settings.require_pin);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const [promoMsg, setPromoMsg] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Remember returning customers' details on this device.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVED) || "null");
      if (s) {
        setForm((f) => ({
          ...f,
          name: s.name ?? "",
          phone: s.phone ?? "",
          address: s.address ?? "",
          zoneId: zones.some((z) => z.id === s.zoneId) ? s.zoneId : "",
        }));
        if (s.pin && Number.isFinite(s.pin.lat)) {
          setPin(s.pin);
          setShowMap(true);
        }
      }
    } catch {}
  }, [zones]);

  // If the chosen slot disappears after a refresh, clear it.
  useEffect(() => {
    if (when && when !== "asap" && !availability.slots.some((x) => x.start === when && !x.full)) setWhen("");
    if (when === "asap" && !availability.asap) setWhen("");
  }, [availability, when]);

  const useZones = type === "delivery" && zones.length > 0;
  const zone = zones.find((z) => z.id === form.zoneId);
  const fee = type !== "delivery" ? 0 : useZones ? (zone?.fee ?? 0) : settings.delivery_fee;
  const minOrder = useZones && zone?.min_order != null ? zone.min_order : settings.min_order;
  const discount = promo ? Math.min(promo.discount, cart.subtotal + fee) : 0;
  const c = currencyOf(settings);
  const total = roundMoney(cart.subtotal + fee - discount, c.decimals ?? 2);
  const belowMin = minOrder > 0 && cart.subtotal < minOrder;

  // Slots grouped by day for the picker.
  const days = useMemo(() => {
    const m = new Map<string, typeof availability.slots>();
    for (const s of availability.slots) m.set(s.day, [...(m.get(s.day) ?? []), s]);
    return [...m.entries()];
  }, [availability]);
  const chosenSlot = availability.slots.find((s) => s.start === when);
  const [day, setDay] = useState<string>("");
  const activeDay = day || chosenSlot?.day || days[0]?.[0] || "";

  async function applyPromo(code: string, quiet = false) {
    if (!code.trim()) return;
    setPromoBusy(true);
    if (!quiet) setPromoMsg("");
    try {
      const res = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: cart.subtotal, deliveryFee: fee, orderType: type, phone: form.phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPromo(null);
        setPromoMsg(data.error || "That code isn't valid");
      } else {
        setPromo({ code: data.code, discount: data.discount, label: data.label });
        setPromoMsg("");
      }
    } catch {
      setPromoMsg("Couldn't check the code. Try again.");
    }
    setPromoBusy(false);
  }

  // Re-check an applied code when the basket, fee or order type changes.
  useEffect(() => {
    if (!promo) return;
    const t = setTimeout(() => applyPromo(promo.code, true), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.subtotal, fee, type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!when) return setError("Please choose when you want your order");
    if (useZones && !zone) return setError("Please choose your delivery area");
    if (type === "delivery" && settings.require_pin && !pin) return setError("Please pin your location on the map");
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
          scheduled_for: when === "asap" ? null : when,
          promo_code: promo?.code,
          location: type === "delivery" ? pin : null,
          items: cart.lines.map((l) => ({ id: l.id, qty: l.qty, choiceIds: l.choiceIds })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // The page may be out of date (areas added, slot filled, code used up): reload its data.
        if (data.code === "zone_required" || res.status === 409) router.refresh();
        if (data.code === "promo_invalid") {
          setPromo(null);
          setPromoMsg(data.error);
        }
        throw new Error(data.error || "Could not place order");
      }
      try {
        localStorage.setItem(
          SAVED,
          JSON.stringify({ name: form.name, phone: form.phone, address: form.address, zoneId: form.zoneId, pin }),
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

      <Toggle value={type} onChange={setType} options={[["delivery", "Delivery"], ["pickup", "Pickup"]]} />

      {/* ---------- When ---------- */}
      <section className="card space-y-3 p-4" aria-label="When">
        <h2 className="font-semibold">When?</h2>
        {!availability.canOrder ? (
          <p className="text-sm text-brand-dark">
            {settings.closed_message}
            {availability.nextOpen && <> Opens {fmtWhen(availability.nextOpen)}.</>}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {availability.asap && (
                <Choice on={when === "asap"} onClick={() => setWhen("asap")}>As soon as possible</Choice>
              )}
              {availability.slots.length > 0 && (
                <Choice on={!!when && when !== "asap"} onClick={() => {
                  const first = availability.slots.find((s) => !s.full);
                  if (when === "asap" || !when) setWhen(first?.start ?? "");
                }}>
                  Schedule for later
                </Choice>
              )}
            </div>
            {!availability.asap && availability.slots.length > 0 && (
              <p className="text-sm text-muted">
                We&apos;re closed right now{availability.nextOpen && <> (opens {fmtWhen(availability.nextOpen)})</>}, but you can pre-order.
              </p>
            )}
            {when !== "asap" && availability.slots.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {days.map(([d, list]) => (
                    <button
                      type="button"
                      key={d}
                      disabled={list.every((s) => s.full)}
                      onClick={() => {
                        setDay(d);
                        const first = list.find((s) => !s.full);
                        if (first) setWhen(first.start);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm disabled:opacity-40 ${
                        activeDay === d ? "border-brand bg-brand/10 font-medium text-brand-dark" : "border-line bg-paper"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <label className="label" htmlFor="slot">{type === "pickup" ? "Pickup time" : "Delivery time"}</label>
                <select id="slot" className="input" value={chosenSlot ? when : ""} onChange={(e) => setWhen(e.target.value)} required>
                  <option value="">Choose a time…</option>
                  {(days.find(([d]) => d === activeDay)?.[1] ?? []).map((s) => (
                    <option key={s.start} value={s.start} disabled={s.full}>
                      {s.time}{s.full ? " — full" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </section>

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
            <select id="zone" className="input" required value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: e.target.value })}>
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
          <>
            <div>
              <label className="label" htmlFor="address">Delivery address</label>
              <textarea id="address" className="input" rows={3} required placeholder="Building, flat, street, landmark"
                value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="label mb-0">
                  Location on map {settings.require_pin ? "" : <span className="font-normal">(optional, helps the driver)</span>}
                </span>
                {!settings.require_pin && showMap && (
                  <button type="button" className="text-xs text-muted" onClick={() => { setShowMap(false); setPin(null); }}>
                    Remove
                  </button>
                )}
              </div>
              {showMap ? (
                <MapPicker
                  center={{ lat: settings.map_center_lat, lng: settings.map_center_lng }}
                  value={pin}
                  onChange={setPin}
                  googleKey={googleMapsKey}
                />
              ) : (
                <button type="button" className="btn-ghost w-full" onClick={() => setShowMap(true)}>📍 Pin my location on the map</button>
              )}
            </div>
          </>
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

      {/* ---------- Promo code ---------- */}
      <section className="card p-4">
        {promo ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-ok">✓ {promo.code} applied</div>
              <div className="text-sm text-muted">{promo.label}</div>
            </div>
            <button type="button" className="text-sm text-muted" onClick={() => { setPromo(null); setPromoInput(""); }}>Remove</button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="label" htmlFor="promo">Promo code</label>
            <div className="flex gap-2">
              <input id="promo" className="input uppercase" placeholder="Enter code" value={promoInput} autoComplete="off"
                onChange={(e) => setPromoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(promoInput); } }} />
              <button type="button" className="btn-ghost" disabled={promoBusy || !promoInput.trim()} onClick={() => applyPromo(promoInput)}>
                {promoBusy ? "…" : "Apply"}
              </button>
            </div>
            {promoMsg && <p className="text-sm text-red-700">{promoMsg}</p>}
          </div>
        )}
      </section>

      <section className="card space-y-1 p-4">
        <Row label="Subtotal" value={money(cart.subtotal, c)} />
        {type === "delivery" && (
          <Row label={`Delivery${zone ? ` · ${zone.name}` : ""}`} value={useZones && !zone ? "—" : money(fee, c)} />
        )}
        {discount > 0 && <Row label={`Discount · ${promo!.code}`} value={`− ${money(discount, c)}`} accent />}
        <Row label={pay === "card" ? "Total" : "Total (pay in cash)"} value={money(total, c)} strong />
        {chosenSlot && <p className="pt-1 text-sm text-muted">{type === "pickup" ? "Pickup" : "Delivery"}: {chosenSlot.day}, {chosenSlot.time}</p>}
        {settings.vat_percent > 0 && <p className="pt-1 text-xs text-muted">Prices include {settings.vat_percent}% VAT.</p>}
      </section>

      {belowMin && <p className="text-sm text-brand-dark">Minimum order{zone ? ` for ${zone.name}` : ""} is {money(minOrder, c)}.</p>}
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button className="btn w-full py-3 text-lg" disabled={busy || belowMin || !availability.canOrder}>
        {busy
          ? pay === "card" ? "Opening payment…" : "Placing order…"
          : pay === "card" ? `Pay ${money(total, c)}` : `${when && when !== "asap" ? "Pre-order" : "Place order"} · ${money(total, c)}`}
      </button>
    </form>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl border px-4 py-3 font-medium ${on ? "border-brand bg-brand/10 text-brand-dark" : "border-line bg-paper"}`}>
      {children}
    </button>
  );
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([k, label]) => (
        <Choice key={k} on={value === k} onClick={() => onChange(k)}>{label}</Choice>
      ))}
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "pt-2 text-lg font-bold" : accent ? "text-ok" : "text-muted"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
