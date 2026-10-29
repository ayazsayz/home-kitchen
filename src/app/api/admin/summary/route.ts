import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { isStaff } from "@/lib/require-staff";
import { buildSummary, emailSummary, summaryText } from "@/lib/summary";
import { todayIn } from "@/lib/tz";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD → summary + WhatsApp text (staff only). */
export async function GET(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const s = await getSettings();
  const q = new URL(req.url).searchParams.get("date") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayIn(s.timezone);
  const summary = await buildSummary(day, s);
  return NextResponse.json({ summary, text: summaryText(summary, s) });
}

/** POST { date } → email the summary now (staff only), e.g. to test the email setup. */
export async function POST(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const s = await getSettings();
  const b = await req.json().catch(() => ({}));
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") ? b.date : todayIn(s.timezone);
  const result = await emailSummary(await buildSummary(day, s), s);
  return NextResponse.json(result, { status: result.sent ? 200 : 400 });
}
