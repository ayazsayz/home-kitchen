import "server-only";
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Rate limits are counted over this many minutes (limits themselves are in Settings; 0 = off). */
export const WINDOW_MIN = 10;

/** Anonymised id for the customer's network/device: we never store the IP itself. */
export function clientHash(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return "";
  const salt = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-12) || "home-kitchen";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 20);
}

/**
 * Refuses orders from blocked numbers and bursts of orders from one number or device.
 * Returns { error, status } when the order must be refused, plus whether it's this number's first order.
 */
export async function screenOrder(db: SupabaseClient, phone: string, hash: string, limits: { phone: number; device: number }) {
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const [blocked, recentPhone, recentDevice, earlier] = await Promise.all([
    db.from("blocked_phones").select("phone").eq("phone", phone).maybeSingle(),
    db.from("orders").select("id", { count: "exact", head: true }).eq("customer_phone", phone).gte("created_at", since),
    hash
      ? db.from("orders").select("id", { count: "exact", head: true }).eq("client_hash", hash).gte("created_at", since)
      : Promise.resolve({ count: 0 }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("customer_phone", phone).not("status", "in", "(rejected,pending_payment)"),
  ]);
  if (blocked.data) return { error: "Sorry, we can't take online orders from this number. Please call us.", status: 403, firstOrder: false };
  if ((limits.phone > 0 && (recentPhone.count ?? 0) >= limits.phone) || (limits.device > 0 && (recentDevice.count ?? 0) >= limits.device))
    return { error: "You've placed several orders in a few minutes. Please wait a little or call us.", status: 429, firstOrder: false };
  return { error: null, status: 200, firstOrder: (earlier.count ?? 0) === 0 };
}
