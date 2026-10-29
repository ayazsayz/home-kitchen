import { currencyOf } from "./format";
import { validTz } from "./tz";
import type { Settings } from "./types";

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
