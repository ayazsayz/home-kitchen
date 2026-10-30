import { currencyOf } from "./format";
import { validTz } from "./tz";
import { DEFAULT_BRAND, normalizeHex } from "./brand";
import type { Closure, Lang, Settings } from "./types";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Meat", "Chicken", "Vegetables & fruit", "Bread & buns", "Dairy", "Spices & oil", "Groceries", "Packaging",
  "Gas", "Delivery & fuel", "Utilities", "Rent", "Salaries", "Equipment", "Marketing", "Other",
];

/** Fills in defaults so older databases (before a migration) still work. */
export function withSettingDefaults(s: Record<string, unknown>): Settings {
  return {
    ...(s as Settings),
    whatsapp_templates: (s.whatsapp_templates as Settings["whatsapp_templates"]) ?? {},
    card_enabled: Boolean(s.card_enabled),
    loyalty_enabled: Boolean(s.loyalty_enabled),
    loyalty_every: Math.max(2, Number(s.loyalty_every) || 10),
    loyalty_kind: s.loyalty_kind === "fixed" ? "fixed" : "percent",
    loyalty_value: s.loyalty_value == null ? 20 : Number(s.loyalty_value),
    loyalty_max: s.loyalty_max == null ? null : Number(s.loyalty_max),
    loyalty_min_order: Number(s.loyalty_min_order) || 0,
    summary_email: String(s.summary_email ?? ""),
    logo_url: String(s.logo_url ?? ""),
    cover_url: String(s.cover_url ?? ""),
    brand_color: normalizeHex(String(s.brand_color ?? "")) ?? DEFAULT_BRAND,
    eta_minutes: s.eta_minutes == null || s.eta_minutes === "" ? null : Number(s.eta_minutes),
    closures: (Array.isArray(s.closures) ? (s.closures as Closure[]) : []).filter(
      (c) => c && /^\d{4}-\d{2}-\d{2}$/.test(c.from) && /^\d{4}-\d{2}-\d{2}$/.test(c.to),
    ),
    max_orders_phone: s.max_orders_phone == null ? 3 : Math.max(0, Number(s.max_orders_phone) || 0),
    max_orders_device: s.max_orders_device == null ? 6 : Math.max(0, Number(s.max_orders_device) || 0),
    late_minutes: s.late_minutes == null ? 30 : Math.max(0, Number(s.late_minutes) || 0),
    backup_weekly: s.backup_weekly !== false,
    whatsapp_button: s.whatsapp_button !== false,
    legal_extra: String(s.legal_extra ?? ""),
    tagline: s.tagline == null ? "Home-cooked, made to order" : String(s.tagline),
    languages: (Array.isArray(s.languages) ? (s.languages as string[]) : ["en"]).filter((l): l is Lang => l === "en" || l === "ar" || l === "ur"),
    default_language: s.default_language === "ar" || s.default_language === "ur" ? s.default_language : "en",
    expense_categories: Array.isArray(s.expense_categories) && s.expense_categories.length ? (s.expense_categories as string[]) : DEFAULT_EXPENSE_CATEGORIES,
    country: String(s.country || "AE"),
    timezone: validTz(s.timezone as string),
    phone_country_code: String(s.phone_country_code || "971").replace(/\D/g, "") || "971",
    currency: String(s.currency || "AED").toUpperCase(),
    currency_symbol: String(s.currency_symbol ?? ""),
    currency_decimals: s.currency_decimals == null ? currencyOf({ currency: String(s.currency || "AED") }).decimals! : Number(s.currency_decimals),
    auto_hours: Boolean(s.auto_hours),
    hours: (s.hours as Settings["hours"]) ?? {},
    allow_asap: s.allow_asap !== false,
    allow_scheduled: Boolean(s.allow_scheduled),
    slot_minutes: Number(s.slot_minutes) || 30,
    slot_capacity: Number(s.slot_capacity) || 0,
    lead_minutes: s.lead_minutes == null ? 45 : Number(s.lead_minutes),
    days_ahead: s.days_ahead == null ? 2 : Number(s.days_ahead),
    require_pin: Boolean(s.require_pin),
    map_center_lat: Number(s.map_center_lat) || 25.2048,
    map_center_lng: Number(s.map_center_lng) || 55.2708,
  };
}
