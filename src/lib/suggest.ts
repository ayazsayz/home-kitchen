import type { CartLine, MenuItem } from "./types";

/**
 * Up to `max` dishes to offer at checkout. Dishes the owner ticked "Suggest at checkout" come first;
 * otherwise cheaper dishes from categories not yet in the cart (e.g. fries and drinks with a burger).
 * Only dishes that can be added in one tap (no options to choose) and aren't already in the cart.
 */
export function suggestions(items: MenuItem[], lines: Pick<CartLine, "id">[], max = 3): MenuItem[] {
  const inCart = new Set(lines.map((l) => l.id));
  if (!inCart.size) return [];
  const oneTap = items.filter(
    (i) => i.available && !inCart.has(i.id) && !i.option_groups?.some((g) => g.choices.length > 0),
  );
  const ticked = oneTap.filter((i) => i.tags?.includes("suggest"));
  if (ticked.length) return ticked.slice(0, max);
  const cartCats = new Set(items.filter((i) => inCart.has(i.id)).map((i) => i.category_id));
  const cartAvg = items.filter((i) => inCart.has(i.id)).reduce((s, i, _, a) => s + i.price / a.length, 0);
  return oneTap
    .filter((i) => !cartCats.has(i.category_id) && i.price <= Math.max(cartAvg, 1))
    .sort((a, b) => Number(!!b.image_url) - Number(!!a.image_url) || b.price - a.price)
    .slice(0, max);
}
