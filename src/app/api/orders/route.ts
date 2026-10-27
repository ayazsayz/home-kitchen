import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalisePhone, round2 } from "@/lib/format";

type Body = {
  order_type?: "delivery" | "pickup";
  customer_name?: string;
  customer_phone?: string;
  address?: string;
  notes?: string;
  items?: { id: string; qty: number }[];
};

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Creates an order. Prices are always taken from the database, never from the browser. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid request");
  }

  const name = (body.customer_name ?? "").trim().slice(0, 80);
  const phone = normalisePhone((body.customer_phone ?? "").trim()).slice(0, 20);
  const type = body.order_type === "pickup" ? "pickup" : "delivery";
  const address = (body.address ?? "").trim().slice(0, 300);
  const notes = (body.notes ?? "").trim().slice(0, 300);
  const lines = (body.items ?? []).filter((l) => l && typeof l.id === "string" && Number.isInteger(l.qty));

  if (!name) return bad("Please enter your name");
  if (!/^\+?\d{7,15}$/.test(phone)) return bad("Please enter a valid mobile number");
  if (type === "delivery" && !address) return bad("Please enter a delivery address");
  if (!lines.length) return bad("Your cart is empty");
  if (lines.some((l) => l.qty < 1 || l.qty > 50)) return bad("Invalid quantity");

  const db = supabaseAdmin();

  const { data: settings, error: sErr } = await db.from("settings").select("*").eq("id", 1).single();
  if (sErr || !settings) return bad("Restaurant not configured", 500);
  if (!settings.is_open) return bad(settings.closed_message || "We are closed right now");

  const ids = [...new Set(lines.map((l) => l.id))];
  const { data: menu, error: mErr } = await db
    .from("menu_items")
    .select("id, name, price, available")
    .in("id", ids);
  if (mErr) return bad("Could not load menu", 500);

  const byId = new Map(menu!.map((m) => [m.id, m]));
  const orderItems = [];
  for (const l of lines) {
    const m = byId.get(l.id);
    if (!m) return bad("An item in your cart no longer exists. Please refresh the menu.");
    if (!m.available) return bad(`${m.name} is sold out. Please remove it from your cart.`);
    const unit = Number(m.price);
    orderItems.push({ menu_item_id: m.id, name: m.name, unit_price: unit, qty: l.qty, line_total: round2(unit * l.qty) });
  }

  const subtotal = round2(orderItems.reduce((s, i) => s + i.line_total, 0));
  const minOrder = Number(settings.min_order);
  if (minOrder > 0 && subtotal < minOrder) return bad(`Minimum order is ${settings.currency} ${minOrder.toFixed(2)}`);
  const fee = type === "delivery" ? Number(settings.delivery_fee) : 0;

  const { data: order, error: oErr } = await db
    .from("orders")
    .insert({
      order_type: type,
      customer_name: name,
      customer_phone: phone,
      address: type === "delivery" ? address : "",
      notes,
      subtotal,
      delivery_fee: fee,
      total: round2(subtotal + fee),
      vat_percent: Number(settings.vat_percent),
      payment_method: "cod",
    })
    .select("id, order_no")
    .single();
  if (oErr || !order) return bad("Could not place order", 500);

  const { error: iErr } = await db
    .from("order_items")
    .insert(orderItems.map((i) => ({ ...i, order_id: order.id })));
  if (iErr) {
    await db.from("orders").delete().eq("id", order.id);
    return bad("Could not place order", 500);
  }

  return NextResponse.json({ id: order.id, order_no: order.order_no });
}
