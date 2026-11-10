// Creates the first owner login for a Docker / offline install (more staff are added inside the app: Staff page).
//   docker compose -f deploy/docker-compose.yml exec app node deploy/scripts/create-owner.mjs owner@shop.com "password" "Name"
const [email, password, name = ""] = process.argv.slice(2);
const url = process.env.SUPABASE_INTERNAL_URL || "http://kong:8000";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 8) {
  console.error('Usage: create-owner.mjs <email> <password (8+ characters)> ["Name"]');
  process.exit(1);
}
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ email: email.toLowerCase(), password, email_confirm: true, user_metadata: { name } }),
});
const user = await res.json().catch(() => ({}));
if (!res.ok || !user.id) {
  console.error("Could not create the login:", user.msg || user.message || user.error_description || res.status);
  process.exit(1);
}
const staff = await fetch(`${url}/rest/v1/staff`, {
  method: "POST",
  headers: { ...h, Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ user_id: user.id, email: email.toLowerCase(), name: name || email.split("@")[0], role: "owner", active: true }),
});
if (!staff.ok) {
  console.error("Login made, but could not mark it as owner:", await staff.text());
  process.exit(1);
}
console.log(`Owner login ready: ${email}`);
