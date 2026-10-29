import "server-only";
import { supabaseServer } from "./supabase-server";
import { isRole, type Role } from "./roles";

export type StaffMember = { userId: string; email: string; name: string; role: Role };

/** The signed-in staff member (from the session cookie), or null. */
export async function currentStaff(): Promise<StaffMember | null> {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await db.from("staff").select("name, email, role, active").eq("user_id", data.user.id).maybeSingle();
  if (!row || !row.active || !isRole(row.role)) return null;
  return { userId: data.user.id, email: row.email || data.user.email || "", name: row.name || row.email || "", role: row.role };
}

/** True when the request comes from active staff with one of these roles. */
export async function hasRole(roles: Role[]) {
  const s = await currentStaff();
  return !!s && roles.includes(s.role);
}

/** Back-compat: any active staff member. */
export async function isStaff() {
  return (await currentStaff()) !== null;
}
