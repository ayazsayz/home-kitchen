import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { statusFromCount, type LoyaltyRules, type LoyaltyStatus } from "./loyalty";
import type { Currency } from "./format";
import type { Lang } from "./types";

/** Earlier orders that earn a stamp: not rejected, paid (if card) and above the minimum. */
export async function qualifyingOrderCount(phone: string, minOrder: number) {
  if (!phone) return 0;
  let q = supabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_phone", phone)
    .not("status", "in", "(rejected,pending_payment)");
  if (minOrder > 0) q = q.gte("subtotal", minOrder);
  const { count } = await q;
  return count ?? 0;
}

export async function loyaltyStatus(phone: string, rules: LoyaltyRules, cur?: Currency, lang: Lang = "en"): Promise<LoyaltyStatus> {
  const count = rules.loyalty_enabled ? await qualifyingOrderCount(phone, rules.loyalty_min_order) : 0;
  return statusFromCount(rules, count, cur, lang);
}
