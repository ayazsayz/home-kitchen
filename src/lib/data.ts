import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { normalise, normaliseOrder } from "./format";
import type { Category, MenuItem, Order, Settings } from "./types";

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabaseAdmin().from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return normalise(data) as Settings;
}

export async function getMenu(): Promise<{ categories: Category[]; items: MenuItem[] }> {
  const db = supabaseAdmin();
  const [c, i] = await Promise.all([
    db.from("categories").select("*").order("sort"),
    db.from("menu_items").select("*").order("sort"),
  ]);
  if (c.error) throw c.error;
  if (i.error) throw i.error;
  return { categories: c.data, items: i.data.map(normalise) as MenuItem[] };
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();
  return data ? (normaliseOrder(data) as Order) : null;
}

