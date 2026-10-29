import { roundMoney } from "./format";
import type { OrderItem } from "./types";

export type DishProfit = { name: string; qty: number; revenue: number; cost: number; profit: number; margin: number | null; missingCost: boolean };

/**
 * Profit per dish from order lines. Uses the cost saved on the order line; for older orders (before costs
 * were entered) falls back to the dish's current cost. Revenue is before order discounts and delivery fees.
 */
export function dishProfit(lines: Pick<OrderItem, "name" | "qty" | "line_total" | "unit_cost" | "menu_item_id">[], currentCost: Record<string, number | null>) {
  const m = new Map<string, { qty: number; revenue: number; cost: number; costedRevenue: number; missing: boolean }>();
  for (const l of lines) {
    const e = m.get(l.name) ?? { qty: 0, revenue: 0, cost: 0, costedRevenue: 0, missing: false };
    const unit = l.unit_cost ?? (l.menu_item_id ? currentCost[l.menu_item_id] : null) ?? null;
    e.qty += l.qty;
    e.revenue += Number(l.line_total);
    if (unit == null) e.missing = true;
    else {
      e.cost += Number(unit) * l.qty;
      e.costedRevenue += Number(l.line_total);
    }
    m.set(l.name, e);
  }
  const rows: DishProfit[] = [...m.entries()].map(([name, e]) => {
    const profit = roundMoney(e.costedRevenue - e.cost, 3);
    return {
      name,
      qty: e.qty,
      revenue: roundMoney(e.revenue, 3),
      cost: roundMoney(e.cost, 3),
      profit,
      margin: e.costedRevenue > 0 ? Math.round((profit / e.costedRevenue) * 100) : null,
      missingCost: e.missing,
    };
  });
  rows.sort((a, b) => b.profit - a.profit || b.revenue - a.revenue);
  const costed = rows.filter((r) => r.margin !== null);
  const totalProfit = roundMoney(costed.reduce((s, r) => s + r.profit, 0), 3);
  const costedRevenue = roundMoney(costed.reduce((s, r) => s + (r.profit + r.cost), 0), 3);
  return { rows, totalProfit, margin: costedRevenue > 0 ? Math.round((totalProfit / costedRevenue) * 100) : null, missing: rows.filter((r) => r.missingCost).length };
}
