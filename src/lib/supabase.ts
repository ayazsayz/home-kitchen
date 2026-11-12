import { createBrowserClient } from "@supabase/ssr";

const raw = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
/** Same cookie name on the browser and the server when they reach Supabase by different addresses (Docker installs). */
export const AUTH_COOKIE = process.env.NEXT_PUBLIC_AUTH_COOKIE || "";

/**
 * Supabase address for the browser. Docker installs use ":8000" = "port 8000 on whatever address this page was
 * opened from", so the kitchen tablet and riders' phones on the shop Wi-Fi reach the same laptop.
 */
export function publicSupabaseUrl() {
  if (raw.startsWith(":") && typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}${raw}`;
  return raw;
}

/** Browser client: public menu reads + staff session (cookie-based). */
export function supabaseBrowser() {
  return createBrowserClient(publicSupabaseUrl(), anon, AUTH_COOKIE ? { cookieOptions: { name: AUTH_COOKIE } } : undefined);
}
