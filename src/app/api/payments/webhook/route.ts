import { NextResponse } from "next/server";
import { syncPaymentByRef } from "@/lib/payments/service";

/**
 * Payment webhook (Ziina or Stripe). The payload is NOT trusted: we only read the
 * payment id from it and then ask the provider directly for the real status.
 * Point the provider's webhook at: https://YOUR-SITE/api/payments/webhook
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ref: unknown = body?.data?.object?.id ?? body?.data?.id ?? body?.id;
  if (typeof ref === "string" && ref.length < 200) {
    try {
      await syncPaymentByRef(ref);
    } catch (e) {
      console.error("webhook sync failed", e);
    }
  }
  return NextResponse.json({ received: true });
}
