import { resolveOptions } from "./options";
import type { CartLine, MenuItem, OrderItem } from "./types";

export type ReorderLine = Omit<CartLine, "key">;

/**
 * Rebuilds cart lines from a past order using TODAY's menu: current prices, current options.
 * Dishes that were removed, are sold out, or whose options no longer exist are skipped.
 */
export function reorderLines(items: OrderItem[], menu: MenuItem[]): { lines: ReorderLine[]; skipped: string[] } {
  const lines: ReorderLine[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    const m = menu.find((x) => x.id === it.menu_item_id) ?? menu.find((x) => x.name === it.name);
    if (!m || !m.available) {
      skipped.push(it.name);
      continue;
    }
    const choiceIds: string[] = [];
    let missing = false;
    for (const p of it.options ?? []) {
      const g = m.option_groups.find((x) => x.name === p.group);
      const c = g?.choices.find((x) => x.name === p.name && x.available !== false);
      if (c) choiceIds.push(c.id);
      else missing = true;
    }
    const res = resolveOptions(m, choiceIds);
    if (missing || !res.ok) {
      skipped.push(it.name);
      continue;
    }
    lines.push({
      id: m.id,
      name: m.name,
      price: Math.round((m.price + res.extra) * 1000) / 1000,
      qty: it.qty,
      choiceIds: res.choiceIds,
      optionLabels: res.picked.map((p) => p.name),
    });
  }
  return { lines, skipped };
}
