"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normaliseOrder, round2 } from "@/lib/format";
import type { Order } from "@/lib/types";

const RANGES = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 6 },
  { key: "30", label: "Last 30 days", days: 29 },
  { key: "90", label: "Last 90 days", days: 89 },
] as const;

/** Start of the day in Dubai time, `daysAgo` days back, as an ISO string. */
function dubaiDayStart(daysAgo: number) {
  const now = new Date();
  const dubai = new Date(now.getTime() + 4 * 3600 * 1000);
  dubai.setUTCHours(0, 0, 0, 0);
  dubai.setUTCDate(dubai.getUTCDate() - daysAgo);
  return new Date(dubai.getTime() - 4 * 3600 * 1000).toISOString();
}
const dubaiDate = (iso: string) => new Date(new Date(iso).getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);

export default function SalesReport() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    db.from("orders")
      .select("*, order_items(*)")
      .gte("created_at", dubaiDayStart(range.days))
      .not("status", "in", "(rejected,pending_payment)")
      .order("created_at")
      .then(({ data }) => {
        setOrders((data ?? []).map((o) => normaliseOrder(o) as Order));
        setLoading(false);
      });
  }, [db, range]);

  const stats = useMemo(() => {
    const revenue = round2(orders.reduce((s, o) => s + o.total, 0));
    const fees = round2(orders.reduce((s, o) => s + o.delivery_fee, 0));
    const discounts = round2(orders.reduce((s, o) => s + (o.discount || 0), 0));
    const card = round2(orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0));
    const items = new Map<string, { qty: number; amount: number }>();
    const days = new Map<string, { count: number; amount: number }>();
    for (const o of orders) {
      for (const i of o.order_items ?? []) {
        const cur = items.get(i.name) ?? { qty: 0, amount: 0 };
        items.set(i.name, { qty: cur.qty + i.qty, amount: round2(cur.amount + i.line_total) });
      }
      const d = dubaiDate(o.created_at);
      const cd = days.get(d) ?? { count: 0, amount: 0 };
      days.set(d, { count: cd.count + 1, amount: round2(cd.amount + o.total) });
    }
    return {
      revenue,
      fees,
      card,
      discounts,
      cash: round2(revenue - card),
      count: orders.length,
      avg: orders.length ? round2(revenue / orders.length) : 0,
      top: [...items.entries()].sort((a, b) => b[1].qty - a[1].qty),
      days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [orders]);

  function exportCsv() {
    const head = ["order_no", "date", "status", "type", "customer", "phone", "items", "area", "payment", "scheduled_for", "promo_code", "discount", "subtotal", "delivery_fee", "total"];
    const rows = orders.map((o) => [
      o.order_no,
      new Date(o.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }),
      o.status,
      o.order_type,
      o.customer_name,
      o.customer_phone,
      (o.order_items ?? []).map((i) => `${i.qty}x ${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(", ")})` : ""}`).join("; "),
      o.zone_name ?? "",
      o.payment_status === "paid" ? "card" : "cash",
      o.scheduled_for ? new Date(o.scheduled_for).toLocaleString("en-GB", { timeZone: "Asia/Dubai" }) : "",
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
        <button className="btn-ghost text-sm" onClick={exportCsv} disabled={!orders.length}>Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Revenue" value={money(stats.revenue)} />
        <Stat label="Orders" value={String(stats.count)} />
        <Stat label="Average order" value={money(stats.avg)} />
        <Stat label="Delivery fees" value={money(stats.fees)} />
        <Stat label="Cash" value={money(stats.cash)} />
        <Stat label="Card" value={money(stats.card)} />
        <Stat label="Promo discounts" value={money(stats.discounts)} />
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
                    <td className="w-28 py-1.5 text-right text-muted">{money(v.amount)}</td>
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
                    {money(v.amount)} <span className="text-muted">({v.count})</span>
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
