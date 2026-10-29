import "server-only";
import { getSettings } from "./data";

/** Home-screen label: whole words up to 12 characters ("My Home Kitchen" → "My Home"). */
function shortName(name: string) {
  if (name.length <= 12) return name;
  let out = "";
  for (const w of name.split(/\s+/)) {
    if ((out ? out.length + 1 : 0) + w.length > 12) break;
    out = out ? `${out} ${w}` : w;
  }
  return out || name.slice(0, 12);
}

/** Web app manifest for the customer app ("/") or the kitchen dashboard ("/admin"). */
export async function manifestFor(kind: "shop" | "kitchen") {
  let name = "Home Kitchen";
  try {
    name = (await getSettings()).name || name;
  } catch {}
  const kitchen = kind === "kitchen";
  const body = {
    name: kitchen ? `${name} · Kitchen` : name,
    short_name: kitchen ? "Kitchen" : shortName(name),
    description: kitchen ? "Orders, menu and reports" : `Order from ${name}`,
    id: kitchen ? "/admin" : "/",
    start_url: kitchen ? "/admin" : "/",
    scope: kitchen ? "/admin" : "/",
    display: "standalone",
    orientation: kitchen ? "any" : "portrait",
    background_color: "#faf6ef",
    theme_color: "#c2410c",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}
