"use client";
import { useCallback, useEffect, useState } from "react";
import type { CartLine } from "./types";

const KEY = "hk_cart_v1";

function read(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
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

  const add = useCallback((item: Omit<CartLine, "qty">) => {
    const cur = read();
    const hit = cur.find((l) => l.id === item.id);
    if (hit) hit.qty += 1;
    else cur.push({ ...item, qty: 1 });
    write(cur);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    const cur = read()
      .map((l) => (l.id === id ? { ...l, qty } : l))
      .filter((l) => l.qty > 0);
    write(cur);
  }, []);

  const clear = useCallback(() => write([]), []);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  return { lines, ready, add, setQty, clear, count, subtotal };
}
