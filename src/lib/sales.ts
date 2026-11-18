import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseOrder, roundMoney } from "./format";
import { dishProfit } from "./profit";
import { addDays, bizDate, bizEndIso, bizStartIso, zoned } from "./tz";
import type { Order } from "./types";

/** A span of business days, both ends included (YYYY-MM-DD). */
export type Range = { from: string; to: string };
export type Expense = { spent_on: string; amount: number; paid_with: string; category: string; description: string };

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "30", label: "Last 30 days" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];

const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = Sunday
export const daysIn = (r: Range) => (r.from && r.to ? Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1 : 0);

export function presetRange(key: PresetKey, today: string): Range {
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "week":
      return { from: addDays(today, -((dowOf(today) + 6) % 7)), to: today }; // Monday → today
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastmonth": {
      const end = addDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${end.slice(0, 8)}01`, to: end };
    }
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/** The same number of days right before. */
export function previousRange(r: Range): Range {
  const n = daysIn(r);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

export function rangeLabel(r: Range) {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
}

/** All orders placed in these business days (cancelled included, unpaid card checkouts left out), page by page. */
export async function loadOrders(db: SupabaseClient, r: Range, tz: string, h: number): Promise<Order[]> {
  const out: Order[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db
      .from("orders")
      .select("*, order_items(*)")
      .gte("created_at", bizStartIso(r.from, tz, h))
      .lt("created_at", bizEndIso(r.to, tz, h))
      .neq("status", "pending_payment")
      .order("created_at")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((o) => normaliseOrder(o) as Order));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function loadExpenses(db: SupabaseClient, r: Range): Promise<Expense[]> {
  const { data } = await db.from("expenses").select("spent_on, amount, paid_with, category, description").gte("spent_on", r.from).lte("spent_on", r.to);
  return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
}

export const CHANNELS = { web: "Website", whatsapp: "WhatsApp", phone: "Phone", walkin: "Walk-in" } as const;
export const channelOf = (o: Order) => (o.source ?? "web") as keyof typeof CHANNELS;
export const isCard = (o: Order) => o.payment_status === "paid";
export const isCancelled = (o: Order) => o.status === "rejected";

const sum = <T>(xs: T[], f: (x: T) => number) => roundMoney(xs.reduce((s, x) => s + f(x), 0), 3);

/** Everything the Overview shows, from one list of orders. */
export function analyse(orders: Order[], expenses: Expense[], r: Range, tz: string, h: number, costs: Record<string, number | null>) {
  const sold = orders.filter((o) => !isCancelled(o));
  const cancelled = orders.filter(isCancelled);
  const net = sum(sold, (o) => o.total);
  const card = sum(sold.filter(isCard), (o) => o.total);
  const spent = sum(expenses, (e) => e.amount);

  // by business day
  const byDayMap = new Map<string, { count: number; amount: number }>();
  if (r.from && r.to) for (let d = r.from, i = 0; d <= r.to && i < 400; d = addDays(d, 1), i++) byDayMap.set(d, { count: 0, amount: 0 });
  // busy hours: 7 days (Mon..Sun) × 24 hours
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const o of sold) {
    const d = bizDate(o.created_at, tz, h);
    const e = byDayMap.get(d) ?? { count: 0, amount: 0 };
    byDayMap.set(d, { count: e.count + 1, amount: roundMoney(e.amount + o.total, 3) });
    const z = zoned(new Date(o.created_at), tz);
    heat[(dowOf(d) + 6) % 7][Math.floor(z.minutes / 60)]++;
  }

  const group = <K extends string>(key: (o: Order) => K) => {
    const m = new Map<K, { count: number; amount: number }>();
    for (const o of sold) {
      const k = key(o);
      const e = m.get(k) ?? { count: 0, amount: 0 };
      m.set(k, { count: e.count + 1, amount: roundMoney(e.amount + o.total, 3) });
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v, share: net ? Math.round((v.amount / net) * 100) : 0 })).sort((a, b) => b.amount - a.amount);
  };

  // customers
  const people = new Map<string, { name: string; phone: string; count: number; amount: number }>();
  for (const o of sold) {
    const k = o.customer_phone || o.customer_name;
    const e = people.get(k) ?? { name: o.customer_name, phone: o.customer_phone, count: 0, amount: 0 };
    people.set(k, { ...e, count: e.count + 1, amount: roundMoney(e.amount + o.total, 3) });
  }
  const newPhones = new Set(sold.filter((o) => o.first_order).map((o) => o.customer_phone));
  const walkins = (p: { phone: string }) => !p.phone || /^0+$/.test(p.phone.replace(/\D/g, ""));
  const known = [...people.values()].filter((p) => !walkins(p));

  const profit = dishProfit(sold.flatMap((o) => o.order_items ?? []), costs);
  return {
    kpi: {
      net,
      count: sold.length,
      avg: sold.length ? roundMoney(net / sold.length, 3) : 0,
      fees: sum(sold, (o) => o.delivery_fee),
      discounts: sum(sold, (o) => o.discount || 0),
      card,
      cash: roundMoney(net - card, 3),
      expenses: spent,
      profit: roundMoney(net - spent, 3),
      cancelled: cancelled.length,
      cancelledAmount: sum(cancelled, (o) => o.total),
    },
    byDay: [...byDayMap.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    heat,
    channels: group((o) => channelOf(o)),
    types: group((o) => o.order_type),
    payments: group((o) => (isCard(o) ? "card" : "cash")),
    zones: group((o) => (o.order_type === "delivery" ? o.zone_name || "No area" : "Pickup")),
    staff: group((o) => o.created_by_name || (channelOf(o) === "web" ? "Website" : "—")),
    customers: {
      total: known.length,
      new: [...newPhones].filter((p) => p && people.has(p)).length,
      returning: known.filter((p) => !newPhones.has(p.phone)).length,
      top: known.sort((a, b) => b.amount - a.amount).slice(0, 10),
    },
    dishes: profit,
    cancelledOrders: cancelled,
  };
}
export type Analysis = ReturnType<typeof analyse>;

/** Day closing numbers for one business day. */
export function closingFor(orders: Order[], expenses: Expense[]) {
  const sold = orders.filter((o) => !isCancelled(o));
  const cancelled = orders.filter(isCancelled);
  const gross = sum(sold, (o) => o.subtotal + o.delivery_fee);
  const discounts = sum(sold, (o) => o.discount || 0);
  const net = sum(sold, (o) => o.total);
  const card = sum(sold.filter(isCard), (o) => o.total);
  const cash = roundMoney(net - card, 3);
  const cashExpenses = sum(expenses.filter((e) => e.paid_with === "cash"), (e) => e.amount);
  const by = <K extends string>(f: (o: Order) => K) =>
    sold.reduce<Record<string, number>>((m, o) => ((m[f(o)] = (m[f(o)] ?? 0) + 1), m), {});
  return {
    orders: sold.length,
    gross,
    discounts,
    net,
    fees: sum(sold, (o) => o.delivery_fee),
    card,
    cash,
    cashExpenses,
    otherExpenses: roundMoney(sum(expenses, (e) => e.amount) - cashExpenses, 3),
    expectedCash: roundMoney(cash - cashExpenses, 3),
    cancelled,
    cancelledAmount: sum(cancelled, (o) => o.total),
    channels: by(channelOf),
    types: by((o) => o.order_type),
    firstAt: sold[0]?.created_at ?? null,
    lastAt: sold[sold.length - 1]?.created_at ?? null,
  };
}
export type Closing = ReturnType<typeof closingFor>;

export type DayClosing = {
  day: string;
  orders: number;
  net_sales: number;
  expected_cash: number;
  counted_cash: number;
  difference: number;
  note: string;
  closed_by_name: string;
  closed_at: string;
};

/** Does an order match the search box? Order #, name, phone, dish, area, staff. */
export function matches(o: Order, q: string) {
  const s = q.trim().toLowerCase().replace(/^#/, "");
  if (!s) return true;
  const digits = s.replace(/\D/g, "");
  if (/^\d+$/.test(s) && String(o.order_no) === s) return true;
  if (digits.length >= 4 && o.customer_phone.replace(/\D/g, "").includes(digits.replace(/^0/, ""))) return true;
  const hay = [o.customer_name, o.zone_name, o.address, o.created_by_name, o.promo_code, ...(o.order_items ?? []).map((i) => i.name)].join(" ").toLowerCase();
  return hay.includes(s);
}
