import { money, roundMoney, type Currency } from "./format";
import type { Purchase, PurchaseLine, RecipeLine, StockItem, StockMove, Supplier, SupplierPayment } from "./types";

export const UNITS = ["pcs", "kg", "g", "L", "ml", "pack", "box", "dozen", "bottle", "can", "bag"];

/** "1.5 kg", "12 pcs" — trims trailing zeros. */
export function fmtQty(n: number, unit = "") {
  const v = Math.round(Number(n) * 1000) / 1000;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ""}`;
}

export const isLow = (i: Pick<StockItem, "qty" | "low_level" | "active">) => i.active && (i.qty <= 0 || (i.low_level > 0 && i.qty <= i.low_level));

/** Average daily usage per item from sales/waste moves in the last `days` days. */
export function dailyUsage(moves: Pick<StockMove, "stock_item_id" | "change" | "kind" | "created_at">[], days = 14, now = Date.now()) {
  const since = now - days * 86400000;
  const used: Record<string, number> = {};
  for (const m of moves) {
    if ((m.kind === "sale" || m.kind === "waste") && Date.parse(m.created_at) >= since && m.change < 0) {
      used[m.stock_item_id] = (used[m.stock_item_id] ?? 0) - m.change;
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(used)) out[k] = v / days;
  return out;
}

/** Days until an item runs out at its recent usage rate (null = no recent usage). */
export const daysLeft = (qty: number, perDay: number | undefined) => (perDay && perDay > 0 ? Math.max(0, qty / perDay) : null);

/** Cost of one portion from its recipe (average ingredient costs). */
export function recipeCost(lines: Pick<RecipeLine, "stock_item_id" | "qty">[], items: Pick<StockItem, "id" | "avg_cost">[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  return roundMoney(lines.reduce((s, l) => s + Number(l.qty) * Number(byId.get(l.stock_item_id)?.avg_cost ?? 0), 0), 3);
}

/** New average cost after receiving `inQty` at `price` (stock below zero counts as zero). */
export function newAvgCost(curQty: number, curAvg: number, inQty: number, price: number) {
  const base = Math.max(0, curQty);
  if (base + inQty <= 0) return price;
  return (base * curAvg + inQty * price) / (base + inQty);
}

export const lineTotal = (l: Pick<PurchaseLine, "qty" | "unit_price">) => Number(l.qty) * Number(l.unit_price);

/** What we owe a supplier: received purchases minus payments. */
export function supplierBalance(supplierId: string, purchases: Pick<Purchase, "supplier_id" | "status" | "total">[], payments: Pick<SupplierPayment, "supplier_id" | "amount">[]) {
  const bought = purchases.filter((p) => p.supplier_id === supplierId && p.status === "received").reduce((s, p) => s + Number(p.total), 0);
  const paid = payments.filter((p) => p.supplier_id === supplierId).reduce((s, p) => s + Number(p.amount), 0);
  return roundMoney(bought - paid, 3);
}

/** WhatsApp text for a purchase order. */
export function purchaseMessage(shop: string, p: Pick<Purchase, "purchase_no" | "note">, lines: Pick<PurchaseLine, "stock_item_id" | "qty">[], items: Pick<StockItem, "id" | "name" | "unit">[], supplier?: Pick<Supplier, "name">) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = lines.map((l) => {
    const it = byId.get(l.stock_item_id);
    return `• ${it?.name ?? "Item"} — ${fmtQty(l.qty, it?.unit)}`;
  });
  return [
    `Salam${supplier?.name ? ` ${supplier.name}` : ""}! Order #${p.purchase_no} from ${shop}:`,
    ...rows,
    p.note ? `Note: ${p.note}` : "",
    "Please confirm the price and delivery time. Thank you!",
  ].filter(Boolean).join("\n");
}

/** Last price paid per item to a supplier (from received purchases, newest first). */
export function lastPrices(purchases: (Pick<Purchase, "supplier_id" | "status" | "created_at"> & { purchase_lines?: Pick<PurchaseLine, "stock_item_id" | "unit_price">[] })[], supplierId?: string | null) {
  const out: Record<string, number> = {};
  const list = [...purchases].filter((p) => p.status === "received" && (!supplierId || p.supplier_id === supplierId)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const p of list) for (const l of p.purchase_lines ?? []) if (out[l.stock_item_id] == null) out[l.stock_item_id] = Number(l.unit_price);
  return out;
}

export const stockValue = (items: Pick<StockItem, "qty" | "avg_cost">[]) => roundMoney(items.reduce((s, i) => s + Math.max(0, i.qty) * i.avg_cost, 0), 3);

export const fmtMoney = (n: number, cur?: Currency) => money(n, cur);
