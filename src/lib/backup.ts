import "server-only";
import { strToU8, zipSync } from "fflate";
import { supabaseAdmin } from "./supabase-server";
import type { Settings } from "./types";

/** Tables included in the backup (each becomes a CSV you can open in Excel / Google Sheets). */
const TABLES = [
  "orders", "order_items", "menu_items", "categories", "delivery_zones", "promo_codes", "expenses",
  "reviews", "customer_notes", "blocked_phones", "cash_handovers", "staff",
] as const;

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Arabic/Urdu text correctly
  return "﻿" + [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\r\n");
}

async function all(table: string) {
  const db = supabaseAdmin();
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999);
    if (error) break; // table missing on an older database: skip it
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** ZIP with one CSV per table + settings.json + a short README. */
export async function buildBackup(s: Settings): Promise<{ zip: Uint8Array; filename: string; counts: Record<string, number> }> {
  const files: Record<string, Uint8Array> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = await all(t);
    counts[t] = rows.length;
    files[`${t}.csv`] = strToU8(csv(rows));
  }
  const { data: settings } = await supabaseAdmin().from("settings").select("*").eq("id", 1).single();
  files["settings.json"] = strToU8(JSON.stringify(settings ?? {}, null, 2));
  const day = new Date().toLocaleDateString("en-CA", { timeZone: s.timezone });
  files["README.txt"] = strToU8(
    `${s.name} — backup ${day}\n\nEach .csv file is one table and opens in Excel or Google Sheets.\n` +
      Object.entries(counts).map(([k, v]) => `${k}: ${v} rows`).join("\n") +
      "\n\nKeep this file somewhere safe (e.g. Google Drive). To restore, ask your developer to import the CSV files into Supabase.\n",
  );
  const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kitchen";
  return { zip: zipSync(files, { level: 6 }), filename: `${slug}-backup-${day}.zip`, counts };
}

/** Emails the backup ZIP to the summary email address(es). */
export async function emailBackup(s: Settings): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const to = s.summary_email?.split(/[,;\s]+/).filter(Boolean) ?? [];
  if (!key) return { sent: false, reason: "RESEND_API_KEY is not set" };
  if (!to.length) return { sent: false, reason: "No summary email in Settings" };
  const { zip, filename, counts } = await buildBackup(s);
  if (zip.length > 30 * 1024 * 1024) return { sent: false, reason: "Backup is too big to email. Use Download backup in Settings." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.SUMMARY_FROM || `${s.name} <onboarding@resend.dev>`,
      to,
      subject: `${s.name} — weekly backup (${counts.orders ?? 0} orders)`,
      text: `Your weekly backup is attached (${filename}). Save it somewhere safe, e.g. Google Drive.\n\n` +
        Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("\n"),
      attachments: [{ filename, content: Buffer.from(zip).toString("base64") }],
    }),
  });
  if (!res.ok) return { sent: false, reason: `Email service said: ${(await res.text()).slice(0, 200)}` };
  return { sent: true };
}
