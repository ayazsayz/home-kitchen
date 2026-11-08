import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { hasRole } from "@/lib/require-staff";
import { buildSummary, emailSummary, summaryText } from "@/lib/summary";
import { bizToday } from "@/lib/tz";
import { businessDayEnd } from "@/lib/schedule";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD → summary + WhatsApp text (staff only). */
export async function GET(req: Request) {
  if (!(await hasRole(["owner"]))) return NextResponse.json({ error: "Owner only" }, { status: 401 });
  const s = await getSettings();
  const q = new URL(req.url).searchParams.get("date") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : bizToday(s.timezone, businessDayEnd(s));
  const summary = await buildSummary(day, s);
  return NextResponse.json({ summary, text: summaryText(summary, s) });
}

/** POST { date } → email the summary now (staff only), e.g. to test the email setup. */
export async function POST(req: Request) {
  if (!(await hasRole(["owner"]))) return NextResponse.json({ error: "Owner only" }, { status: 401 });
  const s = await getSettings();
  const b = await req.json().catch(() => ({}));
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : bizToday(s.timezone, businessDayEnd(s));
  const result = await emailSummary(await buildSummary(day, s), s);
  return NextResponse.json(result, { status: result.sent ? 200 : 400 });
}
