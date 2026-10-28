import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { normalise, normaliseOrder } from "./format";
import { withSettingDefaults } from "./settings";
import { buildSlots, isOpenNow, nextOpening, slotKey, type Slot } from "./schedule";
import type { Category, DeliveryZone, MenuItem, Order, Settings } from "./types";

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabaseAdmin().from("settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return withSettingDefaults(normalise(data));
}

export async function getMenu(): Promise<{ categories: Category[]; items: MenuItem[] }> {
  const db = supabaseAdmin();
  const [c, i] = await Promise.all([
    db.from("categories").select("*").order("sort"),
    db.from("menu_items").select("*").order("sort"),
  ]);
  if (c.error) throw c.error;
  if (i.error) throw i.error;
  return {
    categories: c.data,
    items: i.data.map((x) => ({ ...normalise(x), option_groups: x.option_groups ?? [] })) as MenuItem[],
  };
}

export async function getZones(): Promise<DeliveryZone[]> {
  const { data, error } = await supabaseAdmin().from("delivery_zones").select("*").eq("active", true).order("sort");
  if (error) throw error;
  return data.map((z) => normalise(z) as DeliveryZone);
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

/** Orders already booked per slot (rejected and unpaid card orders don't hold a slot). */
export async function getSlotCounts(days: number): Promise<Record<string, number>> {
  const from = new Date(Date.now() - 3600 * 1000).toISOString();
  const to = new Date(Date.now() + (days + 2) * 86400 * 1000).toISOString();
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("scheduled_for")
    .gte("scheduled_for", from)
    .lte("scheduled_for", to)
    .not("status", "in", "(rejected,pending_payment)");
  const counts: Record<string, number> = {};
  for (const r of data ?? []) {
    const k = slotKey(r.scheduled_for);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export type Availability = {
  asap: boolean; // can order for "as soon as possible" right now
  slots: Slot[]; // scheduled slots (may be empty)
  canOrder: boolean;
  nextOpen: string | null; // ISO, when closed
};

export async function getAvailability(s: Settings): Promise<Availability> {
  const now = new Date();
  const slots = s.allow_scheduled ? buildSlots(s, await getSlotCounts(s.days_ahead), now) : [];
  const asap = s.allow_asap && isOpenNow(s, now);
  const next = !isOpenNow(s, now) && s.is_open ? nextOpening(s, now) : null;
  return { asap, slots, canOrder: asap || slots.some((x) => !x.full), nextOpen: next?.toISOString() ?? null };
}
