"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normaliseOrder, roundMoney } from "@/lib/format";
import { useShop } from "@/lib/use-currency";
import { addDays, dateIn, dateTimeFull, dayStartIso, todayIn } from "@/lib/tz";
import type { Order } from "@/lib/types";

const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 6 },
  { key: "30", label: "Last 30 days", days: 29 },
  { key: "90", label: "Last 90 days", days: 89 },
] as const;

export default function SalesReport() {
  const db = useMemo(() => supabaseBrowser(), []);
  const { cur, tz, ready } = useShop();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return; // wait for the shop's time zone so "today" is the shop's today
    setLoading(true);
    db.from("orders")
      .select("*, order_items(*)")
      .gte("created_at", dayStartIso(addDays(todayIn(tz), -range.days), tz))
      .not("status", "in", "(rejected,pending_payment)")
      .order("created_at")
      .then(({ data }) => {
        setOrders((data ?? []).map((o) => normaliseOrder(o) as Order));
        setLoading(false);
      });
  }, [db, range, tz, ready]);

  const stats = useMemo(() => {
    const revenue = roundMoney(orders.reduce((s, o) => s + o.total, 0), 3);
    const fees = roundMoney(orders.reduce((s, o) => s + o.delivery_fee, 0), 3);
    const discounts = roundMoney(orders.reduce((s, o) => s + (o.discount || 0), 0), 3);
    const card = roundMoney(orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0), 3);
    const items = new Map<string, { qty: number; amount: number }>();
    const days = new Map<string, { count: number; amount: number }>();
    for (const o of orders) {
      for (const i of o.order_items ?? []) {
        const acc = items.get(i.name) ?? { qty: 0, amount: 0 };
        items.set(i.name, { qty: acc.qty + i.qty, amount: roundMoney(acc.amount + i.line_total, 3) });
      }
      const d = dateIn(o.created_at, tz);
      const cd = days.get(d) ?? { count: 0, amount: 0 };
      days.set(d, { count: cd.count + 1, amount: roundMoney(cd.amount + o.total, 3) });
    }
    return {
      revenue,
      fees,
      card,
      discounts,
      cash: roundMoney(revenue - card, 3),
      count: orders.length,
      avg: orders.length ? roundMoney(revenue / orders.length, 3) : 0,
      top: [...items.entries()].sort((a, b) => b[1].qty - a[1].qty),
      days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [orders, tz]);

  function exportCsv() {
    const head = ["order_no", "date", "status", "type", "customer", "phone", "items", "area", "payment", "scheduled_for", "promo_code", "discount", "subtotal", "delivery_fee", "total"];
    const rows = orders.map((o) => [
      o.order_no,
      dateTimeFull(o.created_at, tz),
      o.status,
      o.order_type,
      o.customer_name,
      o.customer_phone,
      (o.order_items ?? []).map((i) => `${i.qty}x ${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(", ")})` : ""}`).join("; "),
      o.zone_name ?? "",
      o.payment_status === "paid" ? "card" : "cash",
      o.scheduled_for ? dateTimeFull(o.scheduled_for, tz) : "",
      o.promo_code ?? "",
      o.discount ?? 0,
      o.subtotal,
      o.delivery_fee,
      o.total,
    ]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `sales-${range.key}.csv`;
    a.click();
  }

  const maxDay = Math.max(1, ...stats.days.map(([, d]) => d.amount));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Sales</h1>
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setRange(r)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${range.key === r.key ? "bg-ink text-white" : "border border-line bg-paper"}`}>
            {r.label}
          </button>
        ))}
        <span className="flex-1" />
        <a href="/admin/expenses" className="text-sm text-brand">Profit & expenses →</a>
        <button className="btn-ghost text-sm" onClick={exportCsv} disabled={!orders.length}>Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Revenue" value={money(stats.revenue, cur)} />
        <Stat label="Orders" value={String(stats.count)} />
        <Stat label="Average order" value={money(stats.avg, cur)} />
        <Stat label="Delivery fees" value={money(stats.fees, cur)} />
        <Stat label="Cash" value={money(stats.cash, cur)} />
        <Stat label="Card" value={money(stats.card, cur)} />
        <Stat label="Promo discounts" value={money(stats.discounts, cur)} />
      </div>
      <p className="text-xs text-muted">Excludes rejected and unpaid card orders. Includes orders still in progress.</p>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Best sellers</h2>
            {stats.top.length === 0 && <p className="text-sm text-muted">No sales yet.</p>}
            <table className="w-full text-sm">
              <tbody>
                {stats.top.map(([name, v]) => (
                  <tr key={name} className="border-b border-line last:border-0">
                    <td className="py-1.5">{name}</td>
                    <td className="py-1.5 text-right font-medium">{v.qty}</td>
                    <td className="w-28 py-1.5 text-right text-muted">{money(v.amount, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">By day</h2>
            <ul className="space-y-2 text-sm">
              {stats.days.map(([d, v]) => (
                <li key={d} className="grid grid-cols-[90px_1fr_100px] items-center gap-3">
                  <span className="text-muted">{d}</span>
                  <span className="h-2.5 rounded-full bg-brand/80" style={{ width: `${(v.amount / maxDay) * 100}%` }} />
                  <span className="text-right">
                    {money(v.amount, cur)} <span className="text-muted">({v.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
