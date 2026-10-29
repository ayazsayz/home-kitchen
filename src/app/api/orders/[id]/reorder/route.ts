import { NextResponse } from "next/server";
import { getMenu, getOrder } from "@/lib/data";
import { reorderLines } from "@/lib/reorder";

/** Cart lines to repeat a past order (the order id is the secret link the customer already has). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, menu] = await Promise.all([getOrder(id), getMenu()]);
  if (!order || order.status === "pending_payment") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { lines, skipped } = reorderLines(order.order_items ?? [], menu.items);
  return NextResponse.json({
    order_no: order.order_no,
    created_at: order.created_at,
    summary: (order.order_items ?? []).map((i) => `${i.qty}× ${i.name}`).join(", "),
    lines,
    skipped,
  });
}
