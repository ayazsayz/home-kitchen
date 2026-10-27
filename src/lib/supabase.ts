import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser client: public menu reads + staff session (cookie-based). */
export function supabaseBrowser() {
  return createBrowserClient(url, anon);
}
