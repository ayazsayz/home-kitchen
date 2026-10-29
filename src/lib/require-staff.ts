import "server-only";
import { supabaseServer } from "./supabase-server";

/** True when the request comes from a logged-in staff member (Supabase session cookie). */
export async function isStaff() {
  const { data } = await (await supabaseServer()).auth.getUser();
  return !!data.user;
}
