import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { buildSummary, emailSummary, justEndedDay } from "@/lib/summary";

export const dynamic = "force-dynamic";

/**
 * Called once a day by Vercel Cron (see vercel.json). Emails the summary of the day that just ended.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is set in the project.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const s = await getSettings();
  const day = justEndedDay(s);
  const result = await emailSummary(await buildSummary(day, s), s);
  return NextResponse.json({ day, ...result });
}
