import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/data";
import { imageData } from "@/lib/image-data";

export const dynamic = "force-dynamic";

/** 1200×630 card shown when the shop link is shared on WhatsApp, Instagram, Facebook, etc. */
export async function GET() {
  let name = "Home Kitchen";
  let tagline = "Order fresh home-cooked food";
  let color = "#c2410c";
  let cover: string | null = null;
  let logo: string | null = null;
  let extra = "Order online";
  try {
    const s = await getSettings();
    name = s.name || name;
    tagline = s.tagline || tagline;
    color = s.brand_color || color;
    [cover, logo] = await Promise.all([imageData(s.cover_url), imageData(s.logo_url)]);
    extra = [s.card_enabled ? "Cash or card" : "Cash on delivery", s.eta_minutes ? `~${s.eta_minutes} min delivery` : ""].filter(Boolean).join(" · ");
  } catch {}
  const initial = (name.trim()[0] || "K").toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: color, fontFamily: "sans-serif" }}>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={cover} width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div
          style={{
            position: "absolute", inset: 0, display: "flex",
            background: cover ? "linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.05) 100%)" : "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(0,0,0,0.25))",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", color: "#fff", width: "100%" }}>
          <div style={{ display: "flex", width: 150, height: 150, borderRadius: 36, background: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 36 }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={logo} width={130} height={130} style={{ objectFit: "contain" }} />
            ) : (
              <div style={{ display: "flex", fontSize: 90, fontWeight: 800, color }}>{initial}</div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: name.length > 18 ? 72 : 88, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 38, marginTop: 18, opacity: 0.92, maxWidth: 950 }}>{tagline}</div>
          <div style={{ display: "flex", marginTop: 40 }}>
            <div style={{ display: "flex", background: "#fff", color: "#1f1a14", borderRadius: 999, padding: "14px 34px", fontSize: 32, fontWeight: 700 }}>
              Order now
            </div>
            <div style={{ display: "flex", alignItems: "center", marginLeft: 24, fontSize: 30, opacity: 0.9 }}>{extra}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=600" } },
  );
}
