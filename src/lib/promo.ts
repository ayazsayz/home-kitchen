import { money, round2 } from "./format";
import type { PromoCode } from "./types";

export type PromoResult = { ok: true; discount: number; label: string } | { ok: false; error: string };

/** Only letters, digits, dash and underscore; upper-case. */
export const cleanCode = (raw: string) => (raw ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);

export function promoLabel(p: Pick<PromoCode, "kind" | "value" | "max_discount">, currency = "AED") {
  if (p.kind === "free_delivery") return "Free delivery";
  if (p.kind === "fixed") return `${money(p.value, currency)} off`;
  return `${Number(p.value)}% off${p.max_discount ? ` (up to ${money(p.max_discount, currency)})` : ""}`;
}

/**
 * Works out the discount for a code, given the order subtotal and delivery fee.
 * Usage limits are checked separately (they need the database).
 */
export function computeDiscount(
  p: PromoCode,
  input: { subtotal: number; deliveryFee: number; isDelivery: boolean },
  currency = "AED",
  now = new Date(),
): PromoResult {
  if (!p.active) return { ok: false, error: "This code is no longer active" };
  if (p.starts_at && now < new Date(p.starts_at)) return { ok: false, error: "This code isn't active yet" };
  if (p.ends_at && now > new Date(p.ends_at)) return { ok: false, error: "This code has expired" };
  if (p.min_order > 0 && input.subtotal < p.min_order) {
    return { ok: false, error: `Spend ${money(p.min_order, currency)} or more to use this code` };
  }
  let discount = 0;
  if (p.kind === "percent") {
    discount = round2((input.subtotal * Math.min(100, p.value)) / 100);
    if (p.max_discount != null && p.max_discount > 0) discount = Math.min(discount, p.max_discount);
  } else if (p.kind === "fixed") {
    discount = Math.min(p.value, input.subtotal);
  } else {
    if (!input.isDelivery) return { ok: false, error: "This code gives free delivery, so it only works for delivery orders" };
    discount = input.deliveryFee;
  }
  return { ok: true, discount: round2(discount), label: promoLabel(p, currency) };
}
