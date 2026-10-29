import { NextResponse } from "next/server";
import { getOrder } from "@/lib/data";
import { supabaseAdmin } from "@/lib/supabase-server";

/** Customer rates a finished order (one review per order; the order link is the secret). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const rating = Math.round(Number(b.rating));
  if (!(rating >= 1 && rating <= 5)) return NextResponse.json({ error: "Please choose 1 to 5 stars" }, { status: 400 });
  const order = await getOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "completed") return NextResponse.json({ error: "You can rate your order once it's done" }, { status: 400 });

  const { error } = await supabaseAdmin().from("reviews").insert({
    order_id: order.id,
    rating,
    comment: String(b.comment ?? "").trim().slice(0, 500),
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "This order has already been rated" }, { status: 409 });
    console.error("review", error);
    return NextResponse.json({ error: "Could not save your review" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
