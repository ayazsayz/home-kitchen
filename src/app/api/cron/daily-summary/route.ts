import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { buildSummary, emailSummary, justEndedDay } from "@/lib/summary";
import { emailBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called once a day by Vercel Cron (see vercel.json). Emails the summary of the day that just ended,
 * and on Sundays (shop time zone) the weekly backup.
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
  const sunday = new Date().toLocaleDateString("en-US", { timeZone: s.timezone, weekday: "short" }) === "Sun";
  const force = new URL(req.url).searchParams.get("backup") === "1";
  const backup = s.backup_weekly && (sunday || force) ? await emailBackup(s).catch((e) => ({ sent: false, reason: String(e) })) : null;
  return NextResponse.json({ day, ...result, backup });
}
