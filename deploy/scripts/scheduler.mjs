// Daily jobs for Docker / offline installs (Vercel cron does this online):
//  - SUMMARY_TIME: daily summary (and weekly backup email) via /api/cron/daily-summary — emails only when RESEND_API_KEY is set
//  - BACKUP_TIME:  backup.sh → BACKUP_DIR. A laptop may be off at that time, so a missed backup runs as soon as it's on again.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATE = `${process.env.BACKUP_OUT || "/backups"}/.hk-scheduler.json`;
const BACKUP_SH = fileURLToPath(new URL("./backup.sh", import.meta.url));
const FIRST = Number(process.env.SCHEDULER_FIRST_MS) || 60000;
const app = process.env.APP_URL || "http://app:3000";
const at = (v, d) => (/^\d{1,2}:\d{2}$/.test(v || "") ? v.padStart(5, "0") : d);
const SUMMARY = at(process.env.SUMMARY_TIME, "07:00");
const BACKUP = at(process.env.BACKUP_TIME, "07:30");

const load = () => {
  try {
    return existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
  } catch {
    return {};
  }
};
const save = (s) => {
  try {
    writeFileSync(STATE, JSON.stringify(s));
  } catch (e) {
    console.error("can't write scheduler state:", e.message);
  }
};
/** Local (TZ) date and HH:MM. */
const nowLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return { day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hm: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
const log = (...a) => console.log(new Date().toISOString(), ...a);

function backup() {
  return new Promise((resolve) => {
    execFile("sh", [BACKUP_SH], { env: process.env, timeout: 30 * 60000 }, (err, stdout, stderr) => {
      if (err) log("backup FAILED:", stderr || err.message);
      else log(stdout.trim());
      resolve(!err);
    });
  });
}

async function summary() {
  try {
    const r = await fetch(`${app}/api/cron/daily-summary`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    log("summary:", r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (e) {
    log("summary FAILED:", e.message);
    return false;
  }
}

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const s = load();
    const { day, hm } = nowLocal();
    // backup: once a day at BACKUP_TIME, or now if the last one is more than a day old (laptop was off)
    const last = s.backupAt ? Date.parse(s.backupAt) : 0;
    if ((hm >= BACKUP && s.backupDay !== day) || Date.now() - last > 26 * 3600000) {
      if (await backup()) Object.assign(s, { backupDay: day, backupAt: new Date().toISOString() });
      else Object.assign(s, { backupAt: new Date(Date.now() - 25 * 3600000).toISOString() }); // try again in ~1 h
      save(s);
    }
    // summary: once a day at SUMMARY_TIME (skipped if the laptop was off then)
    if (hm >= SUMMARY && hm < "12:00" && s.summaryDay !== day) {
      await summary();
      save({ ...load(), summaryDay: day });
    }
  } finally {
    busy = false;
  }
}

log(`scheduler started (TZ=${process.env.TZ || "UTC"}, summary ${SUMMARY}, backup ${BACKUP})`);
setTimeout(tick, FIRST); // give the app a minute to start
setInterval(tick, 60000);
