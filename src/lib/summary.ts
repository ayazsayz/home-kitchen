import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { currencyOf, money, roundMoney } from "./format";
import { addDays, dayEndIso, dayStartIso, zoned } from "./tz";
import type { Settings } from "./types";

export type DailySummary = {
  day: string; // YYYY-MM-DD (shop time zone)
  orders: number;
  revenue: number;
  cash: number;
  card: number;
  discounts: number;
  deliveryFees: number;
  avgOrder: number;
  rejected: number;
  newCustomers: number;
  expenses: number;
  profit: number;
  top: { name: string; qty: number }[];
  lastWeek: { orders: number; revenue: number }; // same weekday a week earlier
  reviews: { avg: number; count: number; low: number }; // ratings left that day
};

async function totalsFor(day: string, tz: string) {
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("total, discount, delivery_fee, payment_status, status, customer_phone, order_items(name, qty)")
    .gte("created_at", dayStartIso(day, tz))
    .lt("created_at", dayEndIso(day, tz))
    .neq("status", "pending_payment");
  return data ?? [];
}

/** Numbers for one day in the shop's time zone (orders counted by when they were placed). */
export async function buildSummary(day: string, s: Settings): Promise<DailySummary> {
  const tz = s.timezone;
  const r = (n: number) => roundMoney(n, 3);
  const db = supabaseAdmin();
  const [rows, prev, exp] = await Promise.all([
    totalsFor(day, tz),
    totalsFor(addDays(day, -7), tz),
    db.from("expenses").select("amount").eq("spent_on", day),
  ]);
  const { data: rev } = await db.from("reviews").select("rating").gte("created_at", dayStartIso(day, tz)).lt("created_at", dayEndIso(day, tz));
  const ratings = (rev ?? []).map((x) => Number(x.rating));
  const ok = rows.filter((o) => o.status !== "rejected");
  const revenue = r(ok.reduce((a, o) => a + Number(o.total), 0));
  const card = r(ok.filter((o) => o.payment_status === "paid").reduce((a, o) => a + Number(o.total), 0));
  const dishes = new Map<string, number>();
  for (const o of ok) for (const i of (o.order_items ?? []) as { name: string; qty: number }[]) dishes.set(i.name, (dishes.get(i.name) ?? 0) + i.qty);

  // New customers: first ever order was on this day.
  const phones = [...new Set(ok.map((o) => o.customer_phone))];
  let newCustomers = 0;
  if (phones.length) {
    const { data: earlier } = await db
      .from("orders")
      .select("customer_phone")
      .in("customer_phone", phones)
      .lt("created_at", dayStartIso(day, tz))
      .neq("status", "rejected");
    const seen = new Set((earlier ?? []).map((x) => x.customer_phone));
    newCustomers = phones.filter((p) => !seen.has(p)).length;
  }

  const expenses = r((exp.data ?? []).reduce((a, x) => a + Number(x.amount), 0));
  const prevOk = prev.filter((o) => o.status !== "rejected");
  return {
    day,
    orders: ok.length,
    revenue,
    card,
    cash: r(revenue - card),
    discounts: r(ok.reduce((a, o) => a + Number(o.discount || 0), 0)),
    deliveryFees: r(ok.reduce((a, o) => a + Number(o.delivery_fee || 0), 0)),
    avgOrder: ok.length ? r(revenue / ok.length) : 0,
    rejected: rows.length - ok.length,
    newCustomers,
    expenses,
    profit: r(revenue - expenses),
    top: [...dishes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty })),
    lastWeek: { orders: prevOk.length, revenue: r(prevOk.reduce((a, o) => a + Number(o.total), 0)) },
    reviews: {
      count: ratings.length,
      avg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0,
      low: ratings.filter((x) => x <= 3).length,
    },
  };
}

/** The business day that just finished: before noon it's yesterday, after noon it's today. */
export function justEndedDay(s: Pick<Settings, "timezone">, now = new Date()) {
  const z = zoned(now, s.timezone);
  return z.minutes < 12 * 60 ? addDays(z.ymd, -1) : z.ymd;
}

const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

function trend(now: number, before: number) {
  if (!before) return "";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? " (same as last week)" : ` (${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% vs last week)`;
}

/** Plain text for WhatsApp. */
export function summaryText(sum: DailySummary, s: Settings) {
  const c = currencyOf(s);
  const lines = [
    `📊 *${s.name}* — ${fmtDay(sum.day)}`,
    "",
    `🧾 Orders: *${sum.orders}*${trend(sum.orders, sum.lastWeek.orders)}`,
    `💰 Sales: *${money(sum.revenue, c)}*${trend(sum.revenue, sum.lastWeek.revenue)}`,
    `   Cash ${money(sum.cash, c)} · Card ${money(sum.card, c)}`,
  ];
  if (sum.discounts > 0) lines.push(`🏷️ Discounts given: ${money(sum.discounts, c)}`);
  lines.push(`🛒 Expenses: ${money(sum.expenses, c)}`);
  lines.push(`✅ Profit: *${money(sum.profit, c)}*`);
  if (sum.orders) lines.push(`📈 Average order: ${money(sum.avgOrder, c)}`);
  if (sum.newCustomers) lines.push(`🙋 New customers: ${sum.newCustomers}`);
  if (sum.rejected) lines.push(`❌ Rejected: ${sum.rejected}`);
  if (sum.reviews?.count) lines.push(`⭐ Rating: ${sum.reviews.avg.toFixed(1)} from ${sum.reviews.count} review${sum.reviews.count === 1 ? "" : "s"}${sum.reviews.low ? ` (${sum.reviews.low} low)` : ""}`);
  if (sum.top.length) {
    lines.push("", "🔥 Top dishes:");
    sum.top.forEach((t, i) => lines.push(`${i + 1}. ${t.name} × ${t.qty}`));
  }
  return lines.join("\n");
}

const esc = (x: string) => x.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Simple HTML email. */
export function summaryHtml(sum: DailySummary, s: Settings) {
  const c = currencyOf(s);
  const row = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#6f655a">${k}</td><td style="padding:6px 0;text-align:right;${strong ? "font-weight:700" : ""}">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;background:#faf6ef;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1f1a14">
  <div style="max-width:480px;margin:0 auto;padding:24px">
    <h1 style="font-size:20px;margin:0 0 4px">${esc(s.name)}</h1>
    <div style="color:#6f655a;margin-bottom:16px">Daily summary · ${fmtDay(sum.day)}</div>
    <div style="background:#fff;border:1px solid #e8dfd2;border-radius:16px;padding:16px">
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        ${row("Orders", `${sum.orders}${esc(trend(sum.orders, sum.lastWeek.orders))}`, true)}
        ${row("Sales", `${money(sum.revenue, c)}${esc(trend(sum.revenue, sum.lastWeek.revenue))}`, true)}
        ${row("Cash", money(sum.cash, c))}
        ${row("Card", money(sum.card, c))}
        ${sum.discounts ? row("Discounts", money(sum.discounts, c)) : ""}
        ${row("Expenses", money(sum.expenses, c))}
        ${row("Profit", money(sum.profit, c), true)}
        ${sum.orders ? row("Average order", money(sum.avgOrder, c)) : ""}
        ${sum.newCustomers ? row("New customers", String(sum.newCustomers)) : ""}
        ${sum.rejected ? row("Rejected", String(sum.rejected)) : ""}
        ${sum.reviews?.count ? row("Rating", `${sum.reviews.avg.toFixed(1)} ★ (${sum.reviews.count} review${sum.reviews.count === 1 ? "" : "s"}${sum.reviews.low ? `, ${sum.reviews.low} low` : ""})`) : ""}
      </table>
      ${sum.top.length ? `<div style="margin-top:12px;font-weight:600">Top dishes</div><ol style="margin:6px 0 0;padding-left:20px">${sum.top.map((t) => `<li>${esc(t.name)} × ${t.qty}</li>`).join("")}</ol>` : ""}
    </div>
  </div></body></html>`;
}

/** Sends the summary by email through Resend (https://resend.com). Returns why it didn't send, if not. */
export async function emailSummary(sum: DailySummary, s: Settings): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const to = s.summary_email?.split(/[,;\s]+/).filter(Boolean) ?? [];
  if (!key) return { sent: false, reason: "RESEND_API_KEY is not set" };
  if (!to.length) return { sent: false, reason: "No summary email in Settings" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.SUMMARY_FROM || `${s.name} <onboarding@resend.dev>`,
      to,
      subject: `${s.name} — ${sum.orders} orders, ${money(sum.revenue, currencyOf(s))} (${sum.day})`,
      html: summaryHtml(sum, s),
      text: summaryText(sum, s).replace(/\*/g, ""),
    }),
  });
  if (!res.ok) return { sent: false, reason: `Email service said: ${(await res.text()).slice(0, 200)}` };
  return { sent: true };
}
