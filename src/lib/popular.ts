import "server-only";
import { supabaseAdmin } from "./supabase-server";

/**
 * Best-selling dishes over the last `days` days (by quantity), most popular first.
 * Only dishes sold at least `min` times count, so a quiet week doesn't crown a one-off.
 */
export async function bestSellers(days = 30, limit = 3, min = 3): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabaseAdmin()
    .from("order_items")
    .select("menu_item_id, qty, orders!inner(created_at, status)")
    .gte("orders.created_at", since)
    .not("orders.status", "in", "(rejected,pending_payment)")
    .limit(5000);
  const qty = new Map<string, number>();
  for (const r of data ?? []) if (r.menu_item_id) qty.set(r.menu_item_id, (qty.get(r.menu_item_id) ?? 0) + r.qty);
  return [...qty.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}
