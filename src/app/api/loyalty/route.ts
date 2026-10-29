import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { currencyOf } from "@/lib/format";
import { loyaltyStatus } from "@/lib/loyalty-server";
import { currentLang } from "@/lib/lang-server";
import { normalisePhone, validPhone } from "@/lib/region";

/** Stamp card for a mobile number (shown at checkout and on the menu). */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const settings = await getSettings();
  if (!settings.loyalty_enabled) return NextResponse.json({ enabled: false });
  const phone = normalisePhone(String(b.phone ?? "").slice(0, 40), settings.phone_country_code);
  if (!validPhone(phone)) return NextResponse.json({ enabled: true, unknown: true });
  return NextResponse.json(await loyaltyStatus(phone, settings, currencyOf(settings), await currentLang(settings)));
}
