import { NextResponse } from "next/server";
import { getSettings } from "@/lib/data";
import { hasRole } from "@/lib/require-staff";
import { buildBackup, emailBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET → download a ZIP of all data (owner only). */
export async function GET() {
  if (!(await hasRole(["owner"]))) return NextResponse.json({ error: "Owner only" }, { status: 401 });
  const { zip, filename } = await buildBackup(await getSettings());
  return new NextResponse(Buffer.from(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

/** POST → email the backup now (owner only), e.g. to test it. */
export async function POST() {
  if (!(await hasRole(["owner"]))) return NextResponse.json({ error: "Owner only" }, { status: 401 });
  const result = await emailBackup(await getSettings());
  return NextResponse.json(result, { status: result.sent ? 200 : 400 });
}
