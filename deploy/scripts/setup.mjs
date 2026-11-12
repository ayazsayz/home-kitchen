// Makes deploy/.env for a new Docker / offline install: strong random passwords and keys + shop settings.
// Usage (no Node needed on the PC — install scripts run it inside Docker):
//   node deploy/scripts/setup.mjs --mode offline --tz Asia/Karachi [--port 3000] [--force]
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const deployDir = join(here, "..");
const out = join(deployDir, ".env");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? "true" : all[i + 1]]] : acc), []),
);

if (existsSync(out) && args.force !== "true") {
  console.log("deploy/.env already exists — keeping it (use --force to make a new one; that makes the old database unreadable).");
  process.exit(0);
}
const mode = ["offline", "docker"].includes(args.mode) ? args.mode : "offline";
const tz = args.tz || "Asia/Karachi";
try {
  new Intl.DateTimeFormat("en", { timeZone: tz });
} catch {
  console.error(`Unknown time zone "${tz}". Use a name like Asia/Karachi or Asia/Dubai.`);
  process.exit(1);
}
const port = /^\d+$/.test(args.port || "") ? args.port : "3000";

const hex = (n) => randomBytes(n).toString("hex");
const b64url = (b) => Buffer.from(b).toString("base64url");
const jwtSecret = hex(32);
const now = Math.floor(Date.now() / 1000);
const jwt = (role) => {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ role, iss: "supabase", iat: now, exp: now + 20 * 365 * 86400 }));
  const sig = createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
};

const set = {
  POSTGRES_PASSWORD: hex(24),
  JWT_SECRET: jwtSecret,
  ANON_KEY: jwt("anon"),
  SERVICE_ROLE_KEY: jwt("service_role"),
  SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_SECRET_KEY: "",
  DASHBOARD_USERNAME: "supabase",
  DASHBOARD_PASSWORD: hex(16),
  SECRET_KEY_BASE: hex(32),
  VAULT_ENC_KEY: hex(16),
  PG_META_CRYPTO_KEY: hex(16),
  LOGFLARE_PUBLIC_ACCESS_TOKEN: hex(24),
  LOGFLARE_PRIVATE_ACCESS_TOKEN: hex(24),
  S3_PROTOCOL_ACCESS_KEY_ID: hex(16),
  S3_PROTOCOL_ACCESS_KEY_SECRET: hex(32),
  POOLER_TENANT_ID: `hk-${hex(4)}`,
  SITE_URL: `http://localhost:${port}`,
  // Staff logins are created by the owner inside the app; nobody can sign up on their own, no emails needed.
  DISABLE_SIGNUP: "true",
  ENABLE_EMAIL_AUTOCONFIRM: "true",
  ENABLE_PHONE_SIGNUP: "false",
  STUDIO_DEFAULT_ORGANIZATION: "Home Kitchen",
  STUDIO_DEFAULT_PROJECT: "Home Kitchen",
  OPENAI_API_KEY: "",
};

const template = readFileSync(join(deployDir, "supabase", ".env.example"), "utf8");
const seen = new Set();
let env = template
  .split("\n")
  .map((line) => {
    const m = /^([A-Z0-9_]+)=/.exec(line);
    if (!m || !(m[1] in set)) return line;
    seen.add(m[1]);
    return `${m[1]}=${set[m[1]]}`;
  })
  .join("\n");
for (const [k, v] of Object.entries(set)) if (!seen.has(k)) env += `\n${k}=${v}`;

env = `############ Home Kitchen ############
# online = Vercel + Supabase Cloud (not this file) · docker = own PC/server, internet optional · offline = no internet, staff screens only
APP_MODE=${mode}
# Customer website: empty = automatic (off when offline), or on / off
FEATURE_CUSTOMER_SITE=
APP_PORT=${port}
SHOP_TIMEZONE=${tz}
CRON_SECRET=${hex(24)}
# Daily jobs (shop time). The laptop can be off then — a missed backup runs at the next start.
SUMMARY_TIME=07:00
BACKUP_TIME=07:30
BACKUP_KEEP_DAYS=30
# Folder for daily backups. Use a USB / external drive if you can, e.g. D:/hk-backups (Windows) or /media/usb/hk-backups.
BACKUP_DIR=./backups
# Optional, need internet: card payments, daily summary email, Google map in checkout
PAYMENT_PROVIDER=
ZIINA_API_KEY=
ZIINA_TEST_MODE=true
STRIPE_SECRET_KEY=
RESEND_API_KEY=
SUMMARY_FROM=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

############ Supabase (made by setup.mjs — keep this file private, back it up) ############
${env}
`;
writeFileSync(out, env, { mode: 0o600 });
console.log(`Made deploy/.env (mode: ${mode}, time zone: ${tz}, app port: ${port}). Keep a copy of it somewhere safe.`);
