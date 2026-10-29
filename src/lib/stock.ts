import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { addDays, dateIn, dayStartIso, todayIn } from "./tz";

/**
 * Daily stock limits. An order uses stock on its *service day*: the day it's scheduled for,
 * or the day it was placed for "as soon as possible" orders. Rejected orders don't count;
 * unpaid card orders hold stock for 30 minutes while the customer pays.
 */
const HOLD_MS = 30 * 60 * 1000;

export type SoldMap = Record<string, Record<string, number>>; // day → menu_item_id → qty

export async function soldByDay(tz: string, days = 15): Promise<SoldMap> {
  const today = todayIn(tz);
  const from = dayStartIso(addDays(today, -1), tz);
  const to = dayStartIso(addDays(today, days + 1), tz);
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("status, created_at, scheduled_for, order_items(menu_item_id, qty)")
    .or(`created_at.gte.${from},scheduled_for.gte.${from}`)
    .neq("status", "rejected");
  const out: SoldMap = {};
  const now = Date.now();
  for (const o of data ?? []) {
    if (o.status === "pending_payment" && now - Date.parse(o.created_at) > HOLD_MS) continue;
    const day = dateIn(o.scheduled_for ?? o.created_at, tz);
    if (o.scheduled_for && o.scheduled_for >= to) continue;
    const m = (out[day] ??= {});
    for (const it of (o.order_items ?? []) as { menu_item_id: string | null; qty: number }[]) {
      if (it.menu_item_id) m[it.menu_item_id] = (m[it.menu_item_id] ?? 0) + it.qty;
    }
  }
  return out;
}

/** Remaining today per limited dish (dishes without a limit are absent). */
export function remainingFor(items: { id: string; daily_limit: number | null }[], sold: SoldMap, day: string) {
  const out: Record<string, number> = {};
  for (const i of items) {
    if (i.daily_limit == null) continue;
    out[i.id] = Math.max(0, i.daily_limit - (sold[day]?.[i.id] ?? 0));
  }
  return out;
}
