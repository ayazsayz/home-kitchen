import { NextResponse } from "next/server";
import { checkPromo } from "@/lib/promo-server";
import { getSettings } from "@/lib/data";
import { currencyOf } from "@/lib/format";
import { currentLang } from "@/lib/lang-server";
import { normalisePhone, validPhone } from "@/lib/region";

/** Preview a promo code at checkout. The real check happens again when the order is placed. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const settings = await getSettings();
  const subtotal = Math.max(0, Number(b.subtotal) || 0);
  const deliveryFee = Math.max(0, Number(b.deliveryFee) || 0);
  const phone = normalisePhone(String(b.phone ?? "").slice(0, 40), settings.phone_country_code).slice(0, 20);
  const res = await checkPromo(
    String(b.code ?? ""),
    { subtotal, deliveryFee, isDelivery: b.orderType !== "pickup", phone: validPhone(phone) ? phone : "" },
    currencyOf(settings),
    await currentLang(settings),
  );
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
