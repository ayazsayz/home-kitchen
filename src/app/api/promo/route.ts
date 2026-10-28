import { NextResponse } from "next/server";
import { checkPromo } from "@/lib/promo-server";
import { normalisePhone } from "@/lib/format";

/** Preview a promo code at checkout. The real check happens again when the order is placed. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const subtotal = Math.max(0, Number(b.subtotal) || 0);
  const deliveryFee = Math.max(0, Number(b.deliveryFee) || 0);
  const phone = normalisePhone(String(b.phone ?? "")).slice(0, 20);
  const res = await checkPromo(String(b.code ?? ""), {
    subtotal,
    deliveryFee,
    isDelivery: b.orderType !== "pickup",
    phone: /^\+?\d{7,15}$/.test(phone) ? phone : "",
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
