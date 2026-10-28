import "server-only";
import { supabaseAdmin } from "../supabase-server";
import { getProvider } from "./providers";

export function cardConfigured() {
  return getProvider() !== null;
}

/** Card is offered to customers only if a provider is configured AND the owner turned it on. */
export function cardAvailable(settings: { card_enabled?: boolean }) {
  return cardConfigured() && Boolean(settings.card_enabled);
}

/** Creates a hosted checkout for an order and returns the URL to send the customer to. */
export async function startPayment(orderId: string, origin: string): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("Card payments are not set up");
  const db = supabaseAdmin();
  const [{ data: order }, { data: settings }] = await Promise.all([
    db.from("orders").select("id, order_no, total, status").eq("id", orderId).single(),
    db.from("settings").select("name, currency").eq("id", 1).single(),
  ]);
  if (!order || order.status !== "pending_payment") throw new Error("This order can't be paid online");

  const back = `${origin}/order/${order.id}`;
  const { ref, redirectUrl } = await provider.createCheckout({
    orderId: order.id,
    orderNo: order.order_no,
    amount: Number(order.total),
    currency: settings?.currency || "AED",
    description: `${settings?.name || "Order"} #${order.order_no}`,
    successUrl: `${back}?payment=done`,
    cancelUrl: `${back}?payment=cancelled`,
  });
  await db.from("orders").update({ payment_ref: ref, payment_status: "pending" }).eq("id", order.id);
  return redirectUrl;
}

/**
 * Asks the provider whether an order is paid. When it is, the order moves to "new"
 * so it appears (and prints) in the kitchen. Safe to call repeatedly.
 */
export async function syncPayment(orderId: string): Promise<"paid" | "pending" | "failed" | null> {
  const provider = getProvider();
  if (!provider) return null;
  const db = supabaseAdmin();
  const { data: o } = await db
    .from("orders")
    .select("id, status, payment_method, payment_ref")
    .eq("id", orderId)
    .single();
  if (!o || o.payment_method !== "card" || o.status !== "pending_payment" || !o.payment_ref) return null;

  const result = await provider.check(o.payment_ref);
  if (result === "paid") {
    const now = new Date().toISOString();
    await db
      .from("orders")
      .update({ status: "new", payment_status: "paid", paid_at: now, updated_at: now })
      .eq("id", o.id)
      .eq("status", "pending_payment"); // only once, even if called concurrently
  } else if (result === "failed") {
    await db.from("orders").update({ payment_status: "failed" }).eq("id", o.id).eq("status", "pending_payment");
  }
  return result;
}

export async function syncPaymentByRef(ref: string) {
  const { data } = await supabaseAdmin().from("orders").select("id").eq("payment_ref", ref).maybeSingle();
  if (data) await syncPayment(data.id);
}
