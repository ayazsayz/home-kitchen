import { round2 } from "./format";
import type { MenuItem, OptionGroup, PickedOption } from "./types";

export type OptionResult =
  | { ok: true; picked: PickedOption[]; extra: number; choiceIds: string[] }
  | { ok: false; error: string };

/**
 * Validates chosen option ids against a dish's option groups and prices them.
 * Used by both the browser (to show the price) and the server (the source of truth).
 */
export function resolveOptions(item: Pick<MenuItem, "name" | "option_groups">, choiceIds: string[]): OptionResult {
  const groups: OptionGroup[] = Array.isArray(item.option_groups) ? item.option_groups : [];
  const chosen = new Set(choiceIds);
  const picked: PickedOption[] = [];
  const ids: string[] = [];
  let extra = 0;

  for (const g of groups) {
    const hits = g.choices.filter((c) => chosen.has(c.id));
    const max = Math.max(1, Number(g.max) || 1);
    if (g.required && hits.length === 0) return { ok: false, error: `Please choose ${g.name} for ${item.name}` };
    if (hits.length > max) return { ok: false, error: `Too many choices for ${g.name} on ${item.name}` };
    for (const c of hits) {
      if (c.available === false) return { ok: false, error: `${c.name} is not available for ${item.name}` };
      const price = Number(c.price) || 0;
      picked.push({ group: g.name, name: c.name, price });
      ids.push(c.id);
      extra += price;
      chosen.delete(c.id);
    }
  }
  if (chosen.size) return { ok: false, error: `Some options for ${item.name} have changed. Please add it again.` };
  return { ok: true, picked, extra: round2(extra), choiceIds: ids };
}

export function cartKey(itemId: string, choiceIds: string[]) {
  return [itemId, ...[...choiceIds].sort()].join("|");
}

export function optionsText(opts: PickedOption[] | undefined) {
  return (opts ?? []).map((o) => o.name).join(", ");
}

/** Short random id for option groups/choices created in the admin. */
export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
