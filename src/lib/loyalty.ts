import { decimalsOf, money, roundMoney, type Currency } from "./format";
import type { Lang, Settings } from "./types";
import { t } from "./i18n";

/** Orders that carry a loyalty reward use this in place of a promo code. */
export const LOYALTY_CODE = "LOYALTY";

export type LoyaltyRules = Pick<
  Settings,
  "loyalty_enabled" | "loyalty_every" | "loyalty_kind" | "loyalty_value" | "loyalty_max" | "loyalty_min_order"
>;

export type LoyaltyStatus = {
  enabled: boolean;
  every: number;
  /** stamps on the card right now (0 … every-1) */
  stamps: number;
  /** the next order is the reward order */
  due: boolean;
  label: string; // "20% off" / "AED 15 off"
  minOrder: number;
};

export function rewardLabel(r: LoyaltyRules, cur?: string | Currency, lang: Lang = "en") {
  if (r.loyalty_kind === "fixed") return t(lang, "amountOff", { amount: money(r.loyalty_value, cur) });
  const n = Number(r.loyalty_value);
  return r.loyalty_max ? t(lang, "pctOffMax", { n, max: money(r.loyalty_max, cur) }) : t(lang, "pctOff", { n });
}

/** Status from the number of earlier qualifying orders for this phone. */
export function statusFromCount(r: LoyaltyRules, count: number, cur?: string | Currency, lang: Lang = "en"): LoyaltyStatus {
  const every = Math.max(2, r.loyalty_every || 10);
  const stamps = count % every;
  return {
    enabled: r.loyalty_enabled,
    every,
    stamps,
    due: r.loyalty_enabled && stamps === every - 1,
    label: rewardLabel(r, cur, lang),
    minOrder: r.loyalty_min_order || 0,
  };
}

/** Discount for a reward order (0 when the order is below the minimum). */
export function rewardDiscount(r: LoyaltyRules, subtotal: number, cur?: string | Currency) {
  if (subtotal < (r.loyalty_min_order || 0)) return 0;
  const d = decimalsOf(cur);
  if (r.loyalty_kind === "fixed") return roundMoney(Math.min(r.loyalty_value, subtotal), d);
  let v = roundMoney((subtotal * Math.min(100, r.loyalty_value)) / 100, d);
  if (r.loyalty_max != null && r.loyalty_max > 0) v = Math.min(v, r.loyalty_max);
  return v;
}

export function loyaltyText(s: LoyaltyStatus, cur?: string | Currency, lang: Lang = "en") {
  const left = s.every - 1 - s.stamps;
  const min = s.minOrder > 0 ? t(lang, "ordersOver", { amount: money(s.minOrder, cur) }) : "";
  if (s.due) return t(lang, "nextReward", { label: s.label });
  return t(lang, left === 1 ? "moreOrder" : "moreOrders", { n: left, min, label: s.label });
}
