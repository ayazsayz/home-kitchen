import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Protects /admin: refreshes the Supabase session and redirects to login if signed out. */
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

  const isLogin = req.nextUrl.pathname === "/admin/login";
  if (!user && !isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/admin/:path*"] };
