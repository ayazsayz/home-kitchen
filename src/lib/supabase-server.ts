import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server side reaches Supabase directly (Docker: http://kong:8000); the browser uses NEXT_PUBLIC_SUPABASE_URL. */
export const serverSupabaseUrl = () => process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const AUTH_COOKIE = process.env.NEXT_PUBLIC_AUTH_COOKIE || "";

/** Service-role client. Server only — bypasses RLS. Never import in client code. */
export function supabaseAdmin() {
  return createClient(
    serverSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Server client acting as the logged-in user (reads auth cookies). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    serverSupabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(AUTH_COOKIE ? { cookieOptions: { name: AUTH_COOKIE } } : {}),
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* called from a Server Component; middleware refreshes the session */
          }
        },
      },
    },
  );
}
