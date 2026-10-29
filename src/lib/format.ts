/** How amounts are shown. `code` is the ISO code (AED, PKR…), used for card payments too. */
export type Currency = { code: string; symbol?: string; decimals?: number };

/** Common currencies with their usual symbol and decimal places. */
export const CURRENCIES: { code: string; name: string; symbol: string; decimals: number }[] = [
  { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
  { code: "QAR", name: "Qatari Riyal", symbol: "QAR", decimals: 2 },
  { code: "OMR", name: "Omani Rial", symbol: "OMR", decimals: 3 },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KWD", decimals: 3 },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BHD", decimals: 3 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "Rs", decimals: 0 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "EGP", decimals: 2 },
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
];

const known = (code: string) => CURRENCIES.find((c) => c.code === code.toUpperCase());

/** Currency settings → display format (falls back to sensible defaults). */
export function currencyOf(s: { currency?: string; currency_symbol?: string | null; currency_decimals?: number | null }): Currency {
  const code = (s.currency || "AED").toUpperCase();
  const k = known(code);
  const d = s.currency_decimals;
  return {
    code,
    symbol: s.currency_symbol?.trim() || k?.symbol || code,
    decimals: d === 0 || d === 2 || d === 3 ? d : (k?.decimals ?? 2),
  };
}

function resolve(cur: string | Currency | undefined): Required<Currency> {
  if (!cur) return { code: "AED", symbol: "AED", decimals: 2 };
  if (typeof cur === "string") {
    const k = known(cur);
    return { code: cur, symbol: k?.symbol ?? cur, decimals: k?.decimals ?? 2 };
  }
  return { code: cur.code, symbol: cur.symbol || cur.code, decimals: cur.decimals ?? 2 };
}

/** e.g. "AED 1,250.00", "Rs 1,250", "KWD 3.500". */
export function money(n: number | string, cur?: string | Currency) {
  const c = resolve(cur);
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  return `${v < 0 ? "-" : ""}${c.symbol} ${s}`;
}

export const decimalsOf = (cur?: string | Currency) => resolve(cur).decimals;

/** Round to the currency's smallest unit (2 decimals by default). */
export function roundMoney(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** VAT portion of a VAT-inclusive amount. */
export function vatIncluded(total: number, vatPercent: number, decimals = 2) {
  if (!vatPercent) return 0;
  return roundMoney(total - total / (1 + vatPercent / 100), decimals);
}

export { timeShort } from "./tz";
export { normalisePhone } from "./region";

/** Postgres numerics arrive as strings — convert the money fields to numbers. */
const NUMERIC = ["amount", "price", "fee", "discount", "value", "max_discount", "delivery_fee", "min_order", "vat_percent", "subtotal", "total", "unit_price", "line_total"];
export function normalise<T>(row: T): T {
  const out = { ...(row as Record<string, unknown>) };
  for (const k of NUMERIC) if (k in out && out[k] != null) out[k] = Number(out[k]);
  return out as T;
}
export function normaliseOrder<T>(row: T): T {
  const o = normalise(row) as Record<string, unknown>;
  if (Array.isArray(o.order_items)) o.order_items = o.order_items.map((x) => normalise(x));
  return o as T;
}
