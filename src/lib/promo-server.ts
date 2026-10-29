import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { normalise } from "./format";
import type { Currency } from "./format";
import { cleanCode, computeDiscount, type PromoResult } from "./promo";
import type { PromoCode } from "./types";

/** Full promo check: rules + total usage + per-customer usage + first-order-only. */
export async function checkPromo(
  rawCode: string,
  input: { subtotal: number; deliveryFee: number; isDelivery: boolean; phone: string },
  currency?: string | Currency,
): Promise<PromoResult & { code?: string }> {
  const code = cleanCode(rawCode);
  if (!code) return { ok: false, error: "Enter a promo code" };
  if (code === "LOYALTY") return { ok: false, error: "That code isn't valid" };
  const db = supabaseAdmin();

  // ilike without wildcards = case-insensitive exact match (code is already restricted to [A-Z0-9_-])
  const { data: row } = await db.from("promo_codes").select("*").ilike("code", code.replace(/_/g, "\\_")).maybeSingle();
  if (!row) return { ok: false, error: "That code isn't valid" };
  const promo = normalise(row) as PromoCode;

  const base = computeDiscount(promo, input, currency);
  if (!base.ok) return base;

  // Orders that count as a use: everything except rejected and unpaid card orders.
  const countUses = async (filter: { code?: string; phone?: string }) => {
    let q = db.from("orders").select("id", { count: "exact", head: true }).not("status", "in", "(rejected,pending_payment)");
    if (filter.code) q = q.ilike("promo_code", filter.code.replace(/_/g, "\\_"));
    if (filter.phone) q = q.eq("customer_phone", filter.phone);
    const { count } = await q;
    return count ?? 0;
  };

  if (promo.usage_limit != null) {
    const n = await countUses({ code: promo.code });
    if (n >= promo.usage_limit) return { ok: false, error: "This code has been fully used" };
  }
  if (input.phone) {
    if (promo.per_customer_limit != null) {
      const n = await countUses({ code: promo.code, phone: input.phone });
      if (n >= promo.per_customer_limit) return { ok: false, error: "You've already used this code" };
    }
    if (promo.first_order_only) {
      const n = await countUses({ phone: input.phone });
      if (n > 0) return { ok: false, error: "This code is for first orders only" };
    }
  } else if (promo.per_customer_limit != null || promo.first_order_only) {
    return { ok: false, error: "Enter your mobile number first, then apply the code" };
  }

  return { ...base, code: promo.code };
}
