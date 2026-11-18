"use client";
import { useMemo } from "react";
import { decimalsOf, money } from "@/lib/format";
import { analyse, CHANNELS, daysIn, rangeLabel, type Analysis } from "@/lib/sales";
import { zoned } from "@/lib/tz";
import { downloadXlsx, moneyFmt, type Cell, type Sheet } from "@/lib/xlsx";
import type { Order } from "@/lib/types";
import type { SalesData } from "./SalesDashboard";
import { Bar, change, ExportButton, fileDate, ordersSheet, Stat, type Shop } from "./shared";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHADES = ["bg-cream", "bg-orange-100", "bg-orange-200", "bg-orange-400", "bg-brand"];
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
const hourLong = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export default function Overview({ shop, s }: { shop: Shop; s: SalesData }) {
  const { cur, tz, dayEnd } = shop;
  const a = useMemo(() => analyse(s.orders, s.expenses, s.range, tz, dayEnd, s.costs), [s.orders, s.expenses, s.range, tz, dayEnd, s.costs]);
  const p = useMemo(() => analyse(s.prevOrders, s.prevExpenses, s.prevRange, tz, dayEnd, s.costs), [s.prevOrders, s.prevExpenses, s.prevRange, tz, dayEnd, s.costs]);
  const single = s.range.from === s.range.to;
  const cmp = (now: number, before: number, good = true) => (s.compare ? change(now, before, good) : { delta: "", tone: "" as const });

  // Busy hours: only the stretch of the day the shop trades in, e.g. 5 PM … 1 AM (starts after the longest quiet gap).
  const hours = useMemo(() => {
    const used = new Set([...Array(24).keys()].filter((h) => a.heat.some((row) => row[h] > 0)));
    if (!used.size) return [];
    let bestStart = dayEnd, bestLen = -1;
    for (let start = 0; start < 24; start++) {
      if (used.has(start) || !used.has((start + 23) % 24)) continue; // a gap starts right after a used hour
      let len = 0;
      while (len < 24 && !used.has((start + len) % 24)) len++;
      if (len > bestLen) [bestStart, bestLen] = [(start + len) % 24, len];
    }
    if (bestLen < 0) return [...Array(24).keys()].map((i) => (dayEnd + i) % 24); // busy all day
    return [...Array(24 - bestLen).keys()].map((i) => (bestStart + i) % 24);
  }, [a.heat, dayEnd]);
  const maxHeat = Math.max(1, ...a.heat.flat());

  // Chart: by day (several days) or by hour (one day)
  const chart = useMemo(() => {
    if (!single) {
      return a.byDay.map((d, i) => ({ label: d.day.slice(5).replace("-", "/"), cur: d.amount, prev: p.byDay[i]?.amount ?? 0, count: d.count }));
    }
    const by = (orders: Order[]) => {
      const m = Array(24).fill(0);
      for (const o of orders) if (o.status !== "rejected") m[Math.floor(zoned(new Date(o.created_at), tz).minutes / 60)] += o.total;
      return m;
    };
    const c = by(s.orders), pr = by(s.prevOrders);
    const hs = hours.length ? hours : [];
    return hs.map((h) => ({ label: hourLabel(h), cur: c[h], prev: pr[h], count: 0 }));
  }, [single, a.byDay, p.byDay, s.orders, s.prevOrders, hours, tz]);
  const maxBar = Math.max(1, ...chart.map((c) => Math.max(c.cur, s.compare ? c.prev : 0)));

  const k = a.kpi, q = p.kpi;

  function exportExcel() {
    downloadXlsx(`sales-overview-${fileDate(s.range.from, s.range.to)}`, overviewWorkbook(a, p, s, shop));
  }

  if (s.loading) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-5" data-testid="sales-overview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{rangeLabel(s.range)} <span className="text-sm font-normal text-muted">· {daysIn(s.range)} day{daysIn(s.range) > 1 ? "s" : ""}</span></h2>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost min-h-11" onClick={() => window.print()}>Print</button>
          <ExportButton onClick={exportExcel} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Net sales" value={money(k.net, cur)} {...cmp(k.net, q.net)} />
        <Stat label="Orders" value={String(k.count)} {...cmp(k.count, q.count)} />
        <Stat label="Average order" value={money(k.avg, cur)} {...cmp(k.avg, q.avg)} />
        <Stat label="Profit" value={money(k.profit, cur)} {...cmp(k.profit, q.profit)} />
        <Stat label="Expenses" value={money(k.expenses, cur)} {...cmp(k.expenses, q.expenses, false)} />
        <Stat label="Cancelled" value={`${k.cancelled}${k.cancelled ? ` · ${money(k.cancelledAmount, cur)}` : ""}`} {...cmp(k.cancelled, q.cancelled, false)} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat small label="Cash" value={money(k.cash, cur)} />
        <Stat small label="Card" value={money(k.card, cur)} />
        <Stat small label="Delivery fees" value={money(k.fees, cur)} />
        <Stat small label="Discounts" value={money(k.discounts, cur)} />
      </div>
      <p className="text-xs text-muted">Net sales = paid and cash orders after discounts, without cancelled ones. Profit = net sales − expenses for these days.</p>

      {k.count === 0 && k.cancelled === 0 ? (
        <p className="card p-6 text-center text-muted">No orders on these days.</p>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card space-y-3 p-4" data-testid="sales-chart">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{single ? "Sales by hour" : "Sales by day"}</h3>
                <div className="flex gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand" />{single ? "This day" : "These days"}</span>
                  {s.compare && <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-orange-200" />Before</span>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="flex h-56 min-w-full items-end gap-1.5" style={{ minWidth: `${chart.length * 34}px` }}>
                  {chart.map((c) => (
                    <div key={c.label} className="flex h-full min-w-7 flex-1 flex-col items-center justify-end gap-1" title={`${c.label}: ${money(c.cur, cur)}`}>
                      <div className="flex h-full w-full items-end justify-center gap-0.5">
                        {s.compare && <div className="w-[40%] rounded-t bg-orange-200" style={{ height: `${(c.prev / maxBar) * 100}%` }} />}
                        <div className="w-[40%] rounded-t bg-brand" style={{ height: `${(c.cur / maxBar) * 100}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-muted">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="card space-y-3 p-4" data-testid="busy-hours">
              <h3 className="font-semibold">Busy hours</h3>
              <p className="text-sm text-muted">Orders by weekday and hour — plan staff for the dark slots.</p>
              {hours.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        <th />
                        {hours.map((h) => <th key={h} className="px-0.5 font-normal text-muted">{hourLabel(h)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {DOW.map((d, di) => (
                        <tr key={d}>
                          <td className="pe-2 text-muted">{d}</td>
                          {hours.map((h) => {
                            const n = a.heat[di][h];
                            const shade = n ? SHADES[Math.min(4, Math.ceil((n / maxHeat) * 4))] : SHADES[0];
                            return <td key={h} className="p-0.5"><div className={`h-6 min-w-5 rounded ${shade}`} title={`${d} ${hourLabel(h)}: ${n} order${n === 1 ? "" : "s"}`} /></td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {busiest(a, hours) && <p className="text-sm">Busiest: <b>{busiest(a, hours)}</b></p>}
            </section>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <section className="card space-y-3 p-4" data-testid="by-channel">
              <h3 className="font-semibold">Where orders come from</h3>
              {a.channels.map((c) => (
                <Bar key={c.key} label={`${CHANNELS[c.key]}: ${c.count}`} value={`${money(c.amount, cur)} · ${c.share}%`} share={c.share} />
              ))}
            </section>
            <section className="card space-y-3 p-4" data-testid="payments">
              <h3 className="font-semibold">Delivery or pickup · cash or card</h3>
              {a.types.map((t) => (
                <Bar key={t.key} label={`${t.key === "delivery" ? "Delivery" : "Pickup"}: ${t.count}`} value={`${money(t.amount, cur)} · ${t.share}%`} share={t.share} />
              ))}
              {a.payments.map((t) => (
                <Bar key={t.key} label={`${t.key === "card" ? "Card" : "Cash"}: ${t.count}`} value={`${money(t.amount, cur)} · ${t.share}%`} share={t.share} />
              ))}
            </section>
            <section className="card space-y-3 p-4" data-testid="customers">
              <h3 className="font-semibold">Customers</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-cream p-3"><div className="text-xs text-muted">Customers</div><div className="text-xl font-bold">{a.customers.total}</div></div>
                <div className="rounded-xl bg-cream p-3"><div className="text-xs text-muted">New</div><div className="text-xl font-bold">{a.customers.new}</div></div>
                <div className="rounded-xl bg-cream p-3"><div className="text-xs text-muted">Returning</div><div className="text-xl font-bold">{a.customers.returning}</div></div>
              </div>
              <div className="text-sm text-muted">Top customers</div>
              <ul className="space-y-1 text-sm">
                {a.customers.top.slice(0, 5).map((c) => (
                  <li key={c.phone + c.name} className="flex justify-between gap-2">
                    <a className="truncate hover:text-brand" href={`/admin/customers?phone=${encodeURIComponent(c.phone)}`}>{c.name} · {c.phone}</a>
                    <b className="whitespace-nowrap">{c.count} · {money(c.amount, cur)}</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="card overflow-x-auto p-4 lg:col-span-2" data-testid="dish-profit">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">Best sellers</h3>
                {a.dishes.margin !== null && (
                  <span className="text-sm">Food profit <b>{money(a.dishes.totalProfit, cur)}</b> · margin <b>{a.dishes.margin}%</b></span>
                )}
              </div>
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 font-medium">Dish</th>
                    <th className="py-1 text-right font-medium">Sold</th>
                    <th className="py-1 text-right font-medium">Sales</th>
                    <th className="py-1 text-right font-medium">Cost</th>
                    <th className="py-1 text-right font-medium">Profit</th>
                    <th className="py-1 text-right font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {[...a.dishes.rows].sort((x, y) => y.qty - x.qty || y.revenue - x.revenue).map((r) => (
                    <tr key={r.name} className="border-t border-line">
                      <td className="py-1.5">{r.name}</td>
                      <td className="py-1.5 text-right font-medium">{r.qty}</td>
                      <td className="py-1.5 text-right">{money(r.revenue, cur)}</td>
                      <td className="py-1.5 text-right text-muted">{r.margin === null ? "—" : money(r.cost, cur)}</td>
                      <td className="py-1.5 text-right font-medium">{r.margin === null ? "—" : money(r.profit, cur)}</td>
                      <td className={`py-1.5 text-right ${r.margin !== null && r.margin < 30 ? "font-semibold text-red-700" : ""}`}>
                        {r.margin === null ? <span className="text-xs text-muted">no cost set</span> : `${r.margin}%${r.missingCost ? "*" : ""}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                Estimate from the &quot;cost to make&quot; on each dish (Menu → edit dish), before discounts and delivery fees.
                {a.dishes.missing > 0 && <> {a.dishes.missing} dish{a.dishes.missing === 1 ? " has" : "es have"} no cost set.</>}
              </p>
            </section>

            <div className="space-y-5">
              <section className="card space-y-2 p-4" data-testid="profit-box">
                <h3 className="font-semibold">Profit</h3>
                <div className="flex justify-between text-sm"><span>Net sales</span><b>{money(k.net, cur)}</b></div>
                <div className="flex justify-between text-sm text-muted"><span>− Expenses (purchases, rent, gas, staff…)</span><span>{money(k.expenses, cur)}</span></div>
                <div className="flex justify-between border-t-2 border-ink pt-2 text-lg">
                  <b>Profit</b>
                  <b className={k.profit < 0 ? "text-red-700" : "text-ok"}>{money(k.profit, cur)}{k.net > 0 ? ` · ${Math.round((k.profit / k.net) * 100)}%` : ""}</b>
                </div>
              </section>
              {a.zones.some((z) => z.key !== "Pickup") && (
                <section className="card space-y-2 p-4">
                  <h3 className="font-semibold">Delivery areas</h3>
                  {a.zones.filter((z) => z.key !== "Pickup").slice(0, 6).map((z) => (
                    <div key={z.key} className="flex justify-between text-sm"><span>{z.key}</span><b>{z.count} · {money(z.amount, cur)}</b></div>
                  ))}
                </section>
              )}
              <section className="card space-y-2 p-4">
                <h3 className="font-semibold">Orders taken by</h3>
                {a.staff.map((z) => (
                  <div key={z.key} className="flex justify-between text-sm"><span>{z.key}</span><b>{z.count} · {money(z.amount, cur)}</b></div>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function busiest(a: Analysis, hours: number[]) {
  let best = { n: 0, d: 0, h: 0 };
  a.heat.forEach((row, d) => hours.forEach((h) => row[h] > best.n && (best = { n: row[h], d, h })));
  return best.n ? `${DOW[best.d]} around ${hourLong(best.h)} (${best.n} order${best.n === 1 ? "" : "s"})` : "";
}

/** One workbook, one sheet per section. */
function overviewWorkbook(a: Analysis, p: Analysis, s: SalesData, shop: Shop): Sheet[] {
  const m = moneyFmt(decimalsOf(shop.cur));
  const pct = (now: number, before: number) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) / 100 : null);
  const k = a.kpi, q = p.kpi;
  const line = (label: string, now: number, before: number): Cell[] => [label, now, before, pct(now, before)];
  const summary: Sheet = {
    name: "Summary",
    rows: [
      ["", `${s.range.from} to ${s.range.to}`, `Before: ${s.prevRange.from} to ${s.prevRange.to}`, "Change"],
      line("Net sales", k.net, q.net),
      line("Orders", k.count, q.count),
      line("Average order", k.avg, q.avg),
      line("Cash", k.cash, q.cash),
      line("Card", k.card, q.card),
      line("Delivery fees", k.fees, q.fees),
      line("Discounts", k.discounts, q.discounts),
      line("Expenses", k.expenses, q.expenses),
      line("Profit (net sales − expenses)", k.profit, q.profit),
      line("Cancelled orders", k.cancelled, q.cancelled),
      line("Cancelled amount", k.cancelledAmount, q.cancelledAmount),
      line("Customers", a.customers.total, p.customers.total),
      line("New customers", a.customers.new, p.customers.new),
    ],
    widths: [30, 22, 30, 10],
    numFmt: [null, m, m, "0%"],
  };
  const byDay: Sheet = {
    name: "By day",
    rows: [["Business day", "Orders", "Net sales"], ...a.byDay.map((d) => [d.day, d.count, d.amount]), [], ["Total", k.count, k.net]],
    widths: [14, 10, 14],
    numFmt: [null, "0", m],
    bold: [a.byDay.length + 2],
  };
  const hoursSheet: Sheet = {
    name: "Busy hours",
    rows: [["Day", ...[...Array(24).keys()].map((h) => `${String(h).padStart(2, "0")}:00`)], ...DOW.map((d, i) => [d, ...a.heat[i]])],
    widths: [8, ...Array(24).fill(7)],
    numFmt: "0",
  };
  const groupSheet = (name: string, head: string, rows: { key: string; count: number; amount: number; share: number }[], label: (k: string) => string = (x) => x): Sheet => ({
    name,
    rows: [[head, "Orders", "Net sales", "Share"], ...rows.map((r) => [label(r.key), r.count, r.amount, r.share / 100])],
    widths: [22, 10, 14, 9],
    numFmt: [null, "0", m, "0%"],
  });
  const dishes: Sheet = {
    name: "Dishes",
    rows: [
      ["Dish", "Sold", "Sales", "Cost", "Profit", "Margin"],
      ...[...a.dishes.rows].sort((x, y) => y.qty - x.qty).map((r) => [r.name, r.qty, r.revenue, r.margin === null ? null : r.cost, r.margin === null ? null : r.profit, r.margin === null ? "no cost set" : r.margin / 100]),
    ],
    widths: [28, 8, 14, 14, 14, 10],
    numFmt: [null, "0", m, m, m, "0%"],
  };
  const customers: Sheet = {
    name: "Top customers",
    rows: [["Customer", "Phone", "Orders", "Spent"], ...a.customers.top.map((c) => [c.name, c.phone, c.count, c.amount])],
    widths: [22, 16, 8, 14],
    numFmt: [null, null, "0", m],
  };
  const expenses: Sheet = {
    name: "Expenses",
    rows: [["Date", "Category", "Description", "Paid with", "Amount"], ...s.expenses.map((e) => [e.spent_on, e.category, e.description, e.paid_with, e.amount]), [], ["Total", null, null, null, k.expenses]],
    widths: [12, 16, 36, 10, 14],
    numFmt: [null, null, null, null, m],
    bold: [s.expenses.length + 2],
  };
  return [
    summary,
    byDay,
    hoursSheet,
    groupSheet("Channels", "From", a.channels, (x) => CHANNELS[x as keyof typeof CHANNELS] ?? x),
    groupSheet("Delivery-Pickup", "Type", a.types, (x) => (x === "delivery" ? "Delivery" : "Pickup")),
    groupSheet("Payment", "Payment", a.payments, (x) => (x === "card" ? "Card" : "Cash")),
    groupSheet("Areas", "Area", a.zones),
    groupSheet("Staff", "Taken by", a.staff),
    dishes,
    customers,
    expenses,
    ordersSheet("Orders", s.orders, shop),
  ];
}
