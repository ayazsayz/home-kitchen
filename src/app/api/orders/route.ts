import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { currencyOf, money, roundMoney } from "@/lib/format";
import { normalisePhone, validPhone } from "@/lib/region";
import { resolveOptions } from "@/lib/options";
import { cardAvailable, startPayment } from "@/lib/payments/service";
import { checkPromo } from "@/lib/promo-server";
import { getAvailability } from "@/lib/data";
import { withSettingDefaults } from "@/lib/settings";
import { slotKey } from "@/lib/schedule";
import type { OptionGroup } from "@/lib/types";

type Body = {
  order_type?: "delivery" | "pickup";
  customer_name?: string;
  customer_phone?: string;
  address?: string;
  zone_id?: string;
  notes?: string;
  payment_method?: "cod" | "card";
  scheduled_for?: string | null;
  promo_code?: string;
  location?: { lat: number; lng: number } | null;
  items?: { id: string; qty: number; choiceIds?: string[] }[];
};

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Creates an order. Prices, options and fees always come from the database, never from the browser. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request");
  }

  const name = (body.customer_name ?? "").trim().slice(0, 80);
  const rawPhone = (body.customer_phone ?? "").trim().slice(0, 40);
  const type = body.order_type === "pickup" ? "pickup" : "delivery";
  const address = (body.address ?? "").trim().slice(0, 300);
  const notes = (body.notes ?? "").trim().slice(0, 300);
  const lines = (body.items ?? []).filter((l) => l && typeof l.id === "string" && Number.isInteger(l.qty));

  if (!name) return bad("Please enter your name");
  if (!/\d{6,}/.test(rawPhone.replace(/\D/g, ""))) return bad("Please enter a valid mobile number");
  if (type === "delivery" && !address) return bad("Please enter a delivery address");
  if (!lines.length) return bad("Your cart is empty");
  if (lines.length > 50 || lines.some((l) => l.qty < 1 || l.qty > 50)) return bad("Invalid quantity");

  const db = supabaseAdmin();

  const { data: settingsRow, error: sErr } = await db.from("settings").select("*").eq("id", 1).single();
  if (sErr || !settingsRow) return bad("Restaurant not configured", 500);
  const settings = withSettingDefaults(settingsRow);
  const cur = currencyOf(settings);
  const phone = normalisePhone(rawPhone, settings.phone_country_code).slice(0, 20);
  if (!validPhone(phone)) return bad("Please enter a valid mobile number");
  const round = (n: number) => roundMoney(n, cur.decimals);

  // ----- when: ASAP or a scheduled slot -----
  const avail = await getAvailability(settings);
  let scheduledFor: string | null = null;
  if (body.scheduled_for) {
    const key = (() => {
      try {
        return slotKey(body.scheduled_for);
      } catch {
        return "";
      }
    })();
    const slot = avail.slots.find((x) => x.start === key);
    if (!slot) return bad("That time is no longer available. Please pick another time.", 409);
    if (slot.full) return bad("That time just filled up. Please pick another time.", 409);
    scheduledFor = slot.start;
  } else if (!avail.asap) {
    if (avail.slots.some((x) => !x.full)) return bad("We're not taking orders for right now. Please choose a time.", 409);
    return bad(settings.closed_message || "We are closed right now");
  }

  // ----- map pin -----
  const loc = body.location;
  const hasPin =
    type === "delivery" &&
    loc != null &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng) &&
    Math.abs(loc.lat) <= 90 &&
    Math.abs(loc.lng) <= 180;
  if (type === "delivery" && settings.require_pin && !hasPin) return bad("Please pin your location on the map");

  // ----- delivery zone -----
  let fee = 0;
  let zoneName = "";
  let minOrder = Number(settings.min_order) || 0;
  if (type === "delivery") {
    const { data: zones } = await db.from("delivery_zones").select("*").eq("active", true);
    if (zones && zones.length) {
      const zone = zones.find((z) => z.id === body.zone_id);
      if (!zone) return NextResponse.json({ error: "Please choose your delivery area", code: "zone_required" }, { status: 400 });
      fee = Number(zone.fee);
      zoneName = zone.name;
      if (zone.min_order != null) minOrder = Number(zone.min_order);
    } else {
      fee = Number(settings.delivery_fee) || 0;
    }
  }

  // ----- items + options -----
  const ids = [...new Set(lines.map((l) => l.id))];
  const { data: menu, error: mErr } = await db
    .from("menu_items")
    .select("id, name, price, available, option_groups")
    .in("id", ids);
  if (mErr) return bad("Could not load menu", 500);

  const byId = new Map(menu!.map((m) => [m.id, m]));
  const orderItems = [];
  for (const l of lines) {
    const m = byId.get(l.id);
    if (!m) return bad("An item in your cart no longer exists. Please refresh the menu.");
    if (!m.available) return bad(`${m.name} is sold out. Please remove it from your cart.`);
    const opts = resolveOptions(
      { name: m.name, option_groups: (m.option_groups ?? []) as OptionGroup[] },
      Array.isArray(l.choiceIds) ? l.choiceIds.filter((x) => typeof x === "string") : [],
    );
    if (!opts.ok) return bad(opts.error);
    const unit = round(Number(m.price) + opts.extra);
    orderItems.push({
      menu_item_id: m.id,
      name: m.name,
      unit_price: unit,
      qty: l.qty,
      line_total: round(unit * l.qty),
      options: opts.picked,
    });
  }

  const subtotal = round(orderItems.reduce((s, i) => s + i.line_total, 0));
  if (minOrder > 0 && subtotal < minOrder) {
    return bad(`Minimum order${zoneName ? ` for ${zoneName}` : ""} is ${money(minOrder, cur)}`);
  }

  // ----- promo code -----
  let discount = 0;
  let promoCode: string | null = null;
  if (body.promo_code && String(body.promo_code).trim()) {
    const promo = await checkPromo(String(body.promo_code), { subtotal, deliveryFee: fee, isDelivery: type === "delivery", phone }, cur);
    if (!promo.ok) return NextResponse.json({ error: promo.error, code: "promo_invalid" }, { status: 400 });
    discount = Math.min(promo.discount, round(subtotal + fee));
    promoCode = promo.code ?? null;
  }
  const total = round(subtotal + fee - discount);

  // ----- payment method -----
  const card = body.payment_method === "card";
  if (card && !cardAvailable(settings)) return bad("Card payment is not available right now. Please choose cash.");
  if (card && total <= 0) return bad("Nothing to pay by card. Please choose cash.");

  const { data: order, error: oErr } = await db
    .from("orders")
    .insert({
      order_type: type,
      customer_name: name,
      customer_phone: phone,
      address: type === "delivery" ? address : "",
      zone_name: zoneName,
      notes,
      subtotal,
      delivery_fee: fee,
      total,
      discount,
      promo_code: promoCode,
      scheduled_for: scheduledFor,
      location_lat: hasPin ? loc!.lat : null,
      location_lng: hasPin ? loc!.lng : null,
      vat_percent: Number(settings.vat_percent),
      payment_method: card ? "card" : "cod",
      payment_status: card ? "pending" : "unpaid",
      status: card ? "pending_payment" : "new",
    })
    .select("id, order_no")
    .single();
  if (oErr || !order) {
    console.error(oErr);
    return bad("Could not place order", 500);
  }

  const { error: iErr } = await db
    .from("order_items")
    .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));
  if (iErr) {
    console.error(iErr);
    await db.from("orders").delete().eq("id", order.id);
    return bad("Could not place order", 500);
  }

  if (card) {
    try {
      const redirectUrl = await startPayment(order.id, new URL(req.url).origin);
      return NextResponse.json({ id: order.id, order_no: order.order_no, redirectUrl });
    } catch (e) {
      console.error(e);
      // Keep the order; the customer can retry or switch to cash from the order page.
      return NextResponse.json({ id: order.id, order_no: order.order_no, paymentError: true });
    }
  }

  return NextResponse.json({ id: order.id, order_no: order.order_no });
}
