"use client";
import { decimalsOf, money, type Currency } from "@/lib/format";
import { CHANNELS, channelOf, isCancelled, isCard } from "@/lib/sales";
import { bizDate, dateTimeFull } from "@/lib/tz";
import type { Order } from "@/lib/types";
import { moneyFmt, type Cell, type Sheet } from "@/lib/xlsx";

export type Shop = { cur: Currency; tz: string; dayEnd: number; ready: boolean };

export function Stat({ label, value, delta, tone, small, testid }: { label: string; value: string; delta?: string; tone?: "up" | "down" | ""; small?: boolean; testid?: string }) {
  return (
    <div className={`card ${small ? "p-3" : "p-4"}`} data-testid={testid}>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 font-bold ${small ? "text-xl" : "text-2xl"}`}>{value}</div>
      {delta && <div className={`mt-1 text-xs font-semibold ${tone === "up" ? "text-ok" : tone === "down" ? "text-red-700" : "text-muted"}`}>{delta}</div>}
    </div>
  );
}

/** "▲ 12% vs before" — `goodWhenUp` false for costs and cancellations. */
export function change(now: number, before: number, goodWhenUp = true): { delta: string; tone: "up" | "down" | "" } {
  if (!before && !now) return { delta: "— same as before", tone: "" };
  if (!before) return { delta: "▲ new", tone: goodWhenUp ? "up" : "down" };
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (pct === 0) return { delta: "— same as before", tone: "" };
  const up = pct > 0;
  return { delta: `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs before`, tone: up === goodWhenUp ? "up" : "down" };
}

export function Bar({ label, value, share, testid }: { label: string; value: string; share: number; testid?: string }) {
  return (
    <div className="space-y-1" data-testid={testid}>
      <div className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <b className="text-right">{value}</b>
      </div>
      <div className="h-2.5 rounded-full bg-cream">
        <div className="h-2.5 rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, share))}%` }} />
      </div>
    </div>
  );
}

export function ExportButton({ onClick, label = "Export to Excel", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ok px-4 font-semibold text-white hover:opacity-90 disabled:opacity-50">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3" />
      </svg>
      {label}
    </button>
  );
}

export const STATUS: Record<string, string> = {
  new: "New", accepted: "Accepted", preparing: "Preparing", ready: "Ready", out_for_delivery: "Out for delivery", completed: "Completed", rejected: "Cancelled",
};

/** The orders sheet used by every Excel export. */
export function ordersSheet(name: string, orders: Order[], shop: Shop): Sheet {
  const dp = decimalsOf(shop.cur);
  const m = moneyFmt(dp);
  const head = ["Order #", "Business day", "Date & time", "Status", "From", "Type", "Customer", "Phone", "Items", "Area", "Payment", "Taken by", "Promo", "Subtotal", "Delivery fee", "Discount", "Total"];
  const rows: Cell[][] = orders.map((o) => [
    o.order_no,
    bizDate(o.created_at, shop.tz, shop.dayEnd),
    dateTimeFull(o.created_at, shop.tz),
    STATUS[o.status] ?? o.status,
    CHANNELS[channelOf(o)],
    o.order_type === "delivery" ? "Delivery" : "Pickup",
    o.customer_name,
    o.customer_phone,
    (o.order_items ?? []).map((i) => `${i.qty}× ${i.name}${i.options?.length ? ` (${i.options.map((x) => x.name).join(", ")})` : ""}`).join("; "),
    o.zone_name ?? "",
    isCard(o) ? "Card" : "Cash",
    o.created_by_name ?? "",
    o.promo_code ?? "",
    o.subtotal,
    o.delivery_fee,
    o.discount || 0,
    o.total,
  ]);
  const ok = orders.filter((o) => !isCancelled(o));
  const total = (f: (o: Order) => number) => Math.round(ok.reduce((s, o) => s + f(o), 0) * 1000) / 1000;
  rows.push([], ["Total (without cancelled)", null, null, null, null, null, null, null, `${ok.length} orders`, null, null, null, null, total((o) => o.subtotal), total((o) => o.delivery_fee), total((o) => o.discount || 0), total((o) => o.total)]);
  return {
    name,
    rows: [head, ...rows],
    widths: [9, 12, 20, 12, 10, 9, 20, 15, 48, 14, 9, 12, 10, 12, 12, 10, 12],
    numFmt: [...Array(13).fill(null), m, m, m, m],
    bold: [rows.length],
  };
}

export const fileDate = (from: string, to: string) => (from === to ? from : `${from}_to_${to}`);
export { money };
