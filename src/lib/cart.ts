"use client";
import { useCallback, useEffect, useState } from "react";
import { cartKey } from "./options";
import type { CartLine } from "./types";

// v2: lines carry options. Old v1 carts are dropped (they can't be matched to options).
const KEY = "hk_cart_v2";

function read(): CartLine[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {}
  window.dispatchEvent(new Event("hk-cart"));
}

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem("hk_cart_v1");
    } catch {}
    const sync = () => setLines(read());
    sync();
    setReady(true);
    window.addEventListener("hk-cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hk-cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback((item: Omit<CartLine, "qty" | "key">, qty = 1) => {
    const key = cartKey(item.id, item.choiceIds);
    const cur = read();
    const hit = cur.find((l) => l.key === key);
    if (hit) hit.qty += qty;
    else cur.push({ ...item, key, qty });
    write(cur);
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    write(
      read()
        .map((l) => (l.key === key ? { ...l, qty } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const clear = useCallback(() => write([]), []);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  /** total quantity of a dish across all its option variants */
  const qtyOfItem = useCallback((id: string) => lines.filter((l) => l.id === id).reduce((s, l) => s + l.qty, 0), [lines]);

  return { lines, ready, add, setQty, clear, count, subtotal, qtyOfItem };
}
