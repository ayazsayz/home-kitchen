import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { cardAvailable, startPayment, syncPayment } from "@/lib/payments/service";

/**
 * For an unpaid card order:
 *   { method: "card" } → new checkout link (retry payment)
 *   { method: "cod" }  → switch to cash on delivery and send to the kitchen
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { method } = await req.json().catch(() => ({ method: "" }));
  const db = supabaseAdmin();

  // If it was actually paid in the meantime, don't change anything.
  await syncPayment(id);
  const { data: order } = await db.from("orders").select("status").eq("id", id).single();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== "pending_payment") return NextResponse.json({ ok: true, alreadyDone: true });

  if (method === "cod") {
    await db
      .from("orders")
      .update({
        payment_method: "cod",
        payment_status: "unpaid",
        payment_ref: null,
        status: "new",
        created_at: new Date().toISOString(), // so the kitchen sees/prints it as a fresh order
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending_payment");
    return NextResponse.json({ ok: true });
  }

  const { data: settings } = await db.from("settings").select("card_enabled").eq("id", 1).single();
  if (!settings || !cardAvailable(settings)) {
    return NextResponse.json({ error: "Card payment is not available right now" }, { status: 400 });
  }
  try {
    const redirectUrl = await startPayment(id, new URL(req.url).origin);
    return NextResponse.json({ redirectUrl });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Could not start payment. Try again or pay cash." }, { status: 502 });
  }
}
