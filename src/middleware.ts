import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canOpen, homeFor, isRole } from "@/lib/roles";

/** Protects /admin: refreshes the Supabase session, sends signed-out users to login and keeps each role to its pages. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const go = (to: string) => {
    const url = req.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    return NextResponse.redirect(url);
  };
  const isLogin = path === "/admin/login";
  if (!user) return isLogin ? res : go("/admin/login");

  // Signed in: check the staff role (own row is readable under RLS).
  const { data: staff } = await supabase.from("staff").select("role, active").eq("user_id", user.id).maybeSingle();
  const role = staff?.active && isRole(staff.role) ? staff.role : null;
  if (!role) return path === "/admin/no-access" ? res : go("/admin/no-access");
  if (isLogin || path === "/admin/no-access") return go(homeFor(role));
  if (!canOpen(role, path)) return go(homeFor(role));
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
