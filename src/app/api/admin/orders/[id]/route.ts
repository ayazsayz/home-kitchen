import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/require-staff";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getOrder, getSettings } from "@/lib/data";
import { currencyOf, normalise, roundMoney } from "@/lib/format";
import { resolveOptions } from "@/lib/options";
import { computeDiscount } from "@/lib/promo";
import { LOYALTY_CODE, rewardDiscount } from "@/lib/loyalty";
import type { OptionGroup, PromoCode } from "@/lib/types";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const OPEN = ["new", "accepted", "preparing", "ready", "out_for_delivery"];

type Body =
  | { action: "cancel"; reason?: string }
  | { action: "edit"; note?: string; items?: { line_id?: string; id: string; qty: number; choiceIds?: string[] }[] };

/**
 * Staff change an order after it was placed: cancel it (with a reason) or change its dishes.
 * Totals, discount and the cost snapshot are recalculated; existing lines keep the price the customer saw.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentStaff();
  if (!me || !["owner", "manager", "cook"].includes(me.role)) return bad("Not allowed", 401);
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) return bad("Order not found", 404);
  const body = (await req.json().catch(() => ({}))) as Body;
  const db = supabaseAdmin();

  if (body.action === "cancel") {
    if (!OPEN.includes(order.status)) return bad("Only open orders can be cancelled");
    const reason = String(body.reason ?? "").trim().slice(0, 200);
    if (!reason) return bad("Please give a reason");
    const now = new Date().toISOString();
    const { error } = await db
      .from("orders")
      .update({ status: "rejected", cancel_reason: reason, cancelled_by_name: me.name, updated_at: now })
      .eq("id", id)
      .in("status", OPEN);
    if (error) return bad("Could not cancel", 500);
    return NextResponse.json({ ok: true });
  }

  if (body.action !== "edit") return bad("Unknown action");
  if (!OPEN.includes(order.status) || order.status === "out_for_delivery") return bad("This order can no longer be changed");
  if (order.payment_status === "paid") return bad("This order was paid by card. Cancel it and refund instead, then place a new order.");
  const lines = (body.items ?? []).filter((l) => l && typeof l.id === "string" && Number.isInteger(l.qty) && l.qty > 0 && l.qty <= 50);
  if (!lines.length) return bad("An order needs at least one dish. Use Cancel instead.");
  if (lines.length > 50) return bad("Too many dishes");

  const settings = await getSettings();
  const cur = currencyOf(settings);
  const round = (n: number) => roundMoney(n, cur.decimals);
  const { data: menu } = await db.from("menu_items").select("id, name, price, option_groups, cost").in("id", [...new Set(lines.map((l) => l.id))]);
  const byId = new Map((menu ?? []).map((m) => [m.id, m]));
  const old = new Map((order.order_items ?? []).map((i) => [i.id, i]));

  const items = [];
  for (const l of lines) {
    const prev = l.line_id ? old.get(l.line_id) : undefined;
    if (prev) {
      // unchanged dish: keep its original price, options and cost
      items.push({ menu_item_id: prev.menu_item_id, name: prev.name, unit_price: prev.unit_price, qty: l.qty, line_total: round(prev.unit_price * l.qty), options: prev.options, unit_cost: prev.unit_cost ?? null });
      continue;
    }
    const m = byId.get(l.id);
    if (!m) return bad("A dish is no longer on the menu");
    const opts = resolveOptions({ name: m.name, option_groups: (m.option_groups ?? []) as OptionGroup[] }, Array.isArray(l.choiceIds) ? l.choiceIds : []);
    if (!opts.ok) return bad(opts.error);
    const unit = round(Number(m.price) + opts.extra);
    items.push({ menu_item_id: m.id, name: m.name, unit_price: unit, qty: l.qty, line_total: round(unit * l.qty), options: opts.picked, unit_cost: m.cost == null ? null : Number(m.cost) });
  }

  const subtotal = round(items.reduce((s, i) => s + i.line_total, 0));
  const fee = Number(order.delivery_fee) || 0;
  let discount = 0;
  if (order.promo_code === LOYALTY_CODE) discount = rewardDiscount(settings, subtotal, cur);
  else if (order.promo_code) {
    const { data: p } = await db.from("promo_codes").select("*").ilike("code", order.promo_code.replace(/_/g, "\\_")).maybeSingle();
    const res = p ? computeDiscount(normalise(p) as PromoCode, { subtotal, deliveryFee: fee, isDelivery: order.order_type === "delivery" }, cur, new Date(order.created_at)) : null;
    discount = res && res.ok ? res.discount : 0;
  }
  discount = Math.min(discount, subtotal + fee);
  const total = round(subtotal + fee - discount);
  const note = String(body.note ?? "").trim().slice(0, 200);
  const edited = `${me.name}${note ? `: ${note}` : ""}`;

  // Replace the lines, then update totals. Restore the old lines if anything fails.
  const oldRows = (order.order_items ?? []).map(({ id: _id, ...r }) => (void _id, r));
  const del = await db.from("order_items").delete().eq("order_id", id);
  if (del.error) return bad("Could not save", 500);
  const ins = await db.from("order_items").insert(items.map((i) => ({ ...i, order_id: id })));
  if (ins.error) {
    await db.from("order_items").insert(oldRows);
    return bad("Could not save", 500);
  }
  const now = new Date().toISOString();
  await db.from("orders").update({ subtotal, discount, total, edited_at: now, edit_note: edited.slice(0, 250), updated_at: now, printed_at: null }).eq("id", id);
  return NextResponse.json({ ok: true, subtotal, discount, total });
}
