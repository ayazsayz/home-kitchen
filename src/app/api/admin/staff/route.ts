import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { currentStaff } from "@/lib/require-staff";
import { isRole } from "@/lib/roles";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function ownerOnly() {
  const me = await currentStaff();
  return me?.role === "owner" ? me : null;
}

async function activeOwners(exceptUserId?: string) {
  let q = supabaseAdmin().from("staff").select("user_id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
  if (exceptUserId) q = q.neq("user_id", exceptUserId);
  const { count } = await q;
  return count ?? 0;
}

/** Add a staff login: { name, email, password, role }. Owner only. */
export async function POST(req: Request) {
  if (!(await ownerOnly())) return bad("Only the owner can add staff", 403);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 60);
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  if (!name) return bad("Enter a name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid email (it's their login)");
  if (password.length < 8) return bad("Password must be at least 8 characters");
  if (!isRole(b.role)) return bad("Choose a role");

  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) {
    return bad(/already|exists|registered/i.test(error?.message ?? "") ? "That email already has a login" : error?.message || "Could not create login");
  }
  const { error: sErr } = await db.from("staff").insert({ user_id: data.user.id, name, email, role: b.role });
  if (sErr) {
    await db.auth.admin.deleteUser(data.user.id).catch(() => {});
    return bad("Could not save staff member", 500);
  }
  return NextResponse.json({ ok: true, user_id: data.user.id });
}

/** Change a staff member: { user_id, role?, active?, name?, password? }. Owner only. */
export async function PATCH(req: Request) {
  const me = await ownerOnly();
  if (!me) return bad("Only the owner can change staff", 403);
  const b = await req.json().catch(() => ({}));
  const userId = String(b.user_id ?? "");
  const db = supabaseAdmin();
  const { data: target } = await db.from("staff").select("*").eq("user_id", userId).maybeSingle();
  if (!target) return bad("Staff member not found", 404);

  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 60);
  if (b.role !== undefined) {
    if (!isRole(b.role)) return bad("Unknown role");
    patch.role = b.role;
  }
  if (b.active !== undefined) patch.active = Boolean(b.active);

  // Never leave the shop without an active owner.
  const losesOwner = target.role === "owner" && target.active && (patch.role && patch.role !== "owner" || patch.active === false);
  if (losesOwner && (await activeOwners(userId)) === 0) return bad("There must be at least one active owner");

  if (b.password !== undefined) {
    const pw = String(b.password);
    if (pw.length < 8) return bad("Password must be at least 8 characters");
    const { error } = await db.auth.admin.updateUserById(userId, { password: pw });
    if (error) return bad(error.message);
  }
  if (Object.keys(patch).length) {
    const { error } = await db.from("staff").update(patch).eq("user_id", userId);
    if (error) return bad(error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
