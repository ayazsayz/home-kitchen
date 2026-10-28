export function money(n: number | string, currency = "AED") {
  return `${currency} ${Number(n).toFixed(2)}`;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** VAT portion of a VAT-inclusive amount. */
export function vatIncluded(total: number, vatPercent: number) {
  if (!vatPercent) return 0;
  return round2(total - total / (1 + vatPercent / 100));
}

export function timeShort(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Normalise UAE mobile numbers to +9715XXXXXXXX where possible. */
export function normalisePhone(raw: string) {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^05\d{8}$/.test(d)) return "+971" + d.slice(1);
  if (/^5\d{8}$/.test(d)) return "+971" + d;
  if (/^9715\d{8}$/.test(d)) return "+" + d;
  if (/^00971/.test(d)) return "+" + d.slice(2);
  return d;
}

/** Postgres numerics arrive as strings — convert the money fields to numbers. */
const NUMERIC = ["price", "fee", "discount", "value", "max_discount", "delivery_fee", "min_order", "vat_percent", "subtotal", "total", "unit_price", "line_total"];
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
