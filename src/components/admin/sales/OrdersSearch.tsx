"use client";
import { useMemo, useState } from "react";
import { money, roundMoney } from "@/lib/format";
import { CHANNELS, channelOf, isCancelled, isCard, matches } from "@/lib/sales";
import { bizDate, timeShort } from "@/lib/tz";
import { downloadXlsx } from "@/lib/xlsx";
import type { Order } from "@/lib/types";
import type { SalesData } from "./SalesDashboard";
import { ExportButton, fileDate, ordersSheet, STATUS, type Shop } from "./shared";

type Filter = { channel: string; type: string; pay: string; status: string };
const CHIPS: { group: keyof Filter; value: string; label: string }[] = [
  ...(Object.entries(CHANNELS) as [string, string][]).map(([value, label]) => ({ group: "channel" as const, value, label })),
  { group: "type", value: "delivery", label: "Delivery" },
  { group: "type", value: "pickup", label: "Pickup" },
  { group: "pay", value: "cash", label: "Cash" },
  { group: "pay", value: "card", label: "Card" },
  { group: "status", value: "done", label: "Completed" },
  { group: "status", value: "open", label: "In progress" },
  { group: "status", value: "cancelled", label: "Cancelled" },
];
const PAGE = 50;

/** Find orders in the chosen dates by order #, customer, phone or dish; filter; export what's shown. */
export default function OrdersSearch({ shop, s }: { shop: Shop; s: SalesData }) {
  const { cur } = shop;
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>({ channel: "", type: "", pay: "", status: "" });
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const out = s.orders.filter(
      (o) =>
        matches(o, q) &&
        (!f.channel || channelOf(o) === f.channel) &&
        (!f.type || o.order_type === f.type) &&
        (!f.pay || (f.pay === "card") === isCard(o)) &&
        (!f.status ||
          (f.status === "cancelled" ? isCancelled(o) : f.status === "done" ? o.status === "completed" : !isCancelled(o) && o.status !== "completed")),
    );
    return out.reverse(); // newest first
  }, [s.orders, q, f]);

  const ok = list.filter((o) => !isCancelled(o));
  const total = roundMoney(ok.reduce((x, o) => x + o.total, 0), 3);
  // A dish search also shows how many of that dish were sold
  const dishQty = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 3) return null;
    let n = 0;
    for (const o of ok) for (const i of o.order_items ?? []) if (i.name.toLowerCase().includes(t)) n += i.qty;
    return n || null;
  }, [ok, q]);

  const toggle = (g: keyof Filter, v: string) => {
    setF({ ...f, [g]: f[g] === v ? "" : v });
    setShown(PAGE);
  };
  const exportExcel = () => downloadXlsx(`orders-${fileDate(s.range.from, s.range.to)}${q.trim() ? `-${q.trim().replace(/[^\w-]+/g, "_").slice(0, 20)}` : ""}`, [ordersSheet("Orders", [...list].reverse(), shop)]);

  return (
    <div className="space-y-4" data-testid="orders-search">
      <div className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="order-search" className="sr-only">Search orders</label>
          <input id="order-search" className="input min-w-0 flex-1 basis-72 text-base" placeholder="Order #, customer name or phone, dish, area…" value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }} />
          <ExportButton onClick={exportExcel} disabled={!list.length} label={`Export ${list.length} order${list.length === 1 ? "" : "s"} to Excel`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const on = f[c.group] === c.value;
            return (
              <button key={c.group + c.value} type="button" onClick={() => toggle(c.group, c.value)} aria-pressed={on}
                className={`min-h-9 rounded-full border px-3 text-sm font-medium ${on ? "border-ink bg-ink text-white" : "border-line bg-paper"}`}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-sm text-muted">Orders found</div><div className="text-xl font-bold" data-testid="found-count">{list.length}</div></div>
        <div className="card p-3"><div className="text-sm text-muted">Total (without cancelled)</div><div className="text-xl font-bold" data-testid="found-total">{money(total, cur)}</div></div>
        <div className="card p-3"><div className="text-sm text-muted">Average</div><div className="text-xl font-bold">{money(ok.length ? total / ok.length : 0, cur)}</div></div>
        {dishQty !== null && <div className="card p-3"><div className="text-sm text-muted">&quot;{q.trim()}&quot; sold</div><div className="text-xl font-bold" data-testid="dish-qty">{dishQty}</div></div>}
      </div>

      {s.loading ? (
        <p className="text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="card p-6 text-center text-muted">No orders match. Try other dates or words.</p>
      ) : (
        <section className="card overflow-x-auto p-2">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="p-2 font-medium">Order</th>
                <th className="p-2 font-medium">Day · time</th>
                <th className="p-2 font-medium">Customer</th>
                <th className="p-2 font-medium">Items</th>
                <th className="p-2 font-medium">From</th>
                <th className="p-2 font-medium">Payment</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((o) => (
                <Row key={o.id} o={o} shop={shop} open={open === o.id} toggle={() => setOpen(open === o.id ? null : o.id)} />
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pt-3 text-sm text-muted">
            <span>Showing {Math.min(shown, list.length)} of {list.length}</span>
            {shown < list.length && <button type="button" className="btn-ghost" onClick={() => setShown(shown + PAGE)}>Show more</button>}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ o, shop, open, toggle }: { o: Order; shop: Shop; open: boolean; toggle: () => void }) {
  const { cur, tz, dayEnd } = shop;
  const cancelled = isCancelled(o);
  const items = (o.order_items ?? []).map((i) => `${i.qty}× ${i.name}`).join(", ");
  return (
    <>
      <tr className={`border-t border-line ${cancelled ? "text-muted" : ""}`} data-testid="order-row">
        <td className="p-2"><button type="button" className="font-bold text-brand" onClick={toggle} aria-expanded={open}>#{o.order_no}</button></td>
        <td className="whitespace-nowrap p-2">{bizDate(o.created_at, tz, dayEnd).slice(5).replace("-", "/")} · {timeShort(o.created_at, tz)}</td>
        <td className="p-2">{o.customer_name}<span className="block text-xs text-muted">{o.customer_phone}</span></td>
        <td className="max-w-[18rem] truncate p-2 text-muted" title={items}>{items}</td>
        <td className="p-2">{CHANNELS[channelOf(o)]}</td>
        <td className="p-2">{isCard(o) ? "Card" : "Cash"}</td>
        <td className="p-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cancelled ? "bg-red-100 text-red-800" : o.status === "completed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
            {STATUS[o.status] ?? o.status}
          </span>
        </td>
        <td className={`p-2 text-right font-semibold ${cancelled ? "line-through" : ""}`}>{money(o.total, cur)}</td>
      </tr>
      {open && (
        <tr className="bg-cream/60">
          <td colSpan={8} className="p-3 text-sm">
            <ul className="space-y-0.5">
              {(o.order_items ?? []).map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>{i.qty}× {i.name}{i.options?.length ? <span className="text-muted"> ({i.options.map((x) => x.name).join(", ")})</span> : null}</span>
                  <span>{money(i.line_total, cur)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-muted">
              {o.order_type === "delivery" ? `Delivery · ${o.zone_name || ""} ${o.address}` : "Pickup"}
              {o.delivery_fee ? ` · fee ${money(o.delivery_fee, cur)}` : ""}
              {o.discount ? ` · discount ${money(o.discount, cur)}${o.promo_code ? ` (${o.promo_code})` : ""}` : ""}
              {o.created_by_name ? ` · taken by ${o.created_by_name}` : ""}
              {o.notes ? ` · note: ${o.notes}` : ""}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
