import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/data";
import { imageData } from "@/lib/image-data";

export const dynamic = "force-dynamic";

/** App icon: the restaurant's initial on the brand colour (no logo upload needed). */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = [180, 192, 512].includes(Number(raw)) ? Number(raw) : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  let name = "Home Kitchen";
  let color = "#c2410c";
  let logo = "";
  try {
    const s = await getSettings();
    name = s.name || name;
    color = s.brand_color || color;
    logo = (await imageData(s.logo_url)) ?? ""; // skipped if it can't be drawn (e.g. WebP)
  } catch {}
  const initial = (name.trim()[0] || "K").toUpperCase();
  if (logo) {
    // Uploaded logo on white, with padding so it isn't cropped by round/maskable icon shapes.
    const pad = Math.round(size * (maskable ? 0.18 : 0.08));
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: pad }}>
          {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
          <img src={logo} width={size - 2 * pad} height={size - 2 * pad} style={{ objectFit: "contain" }} />
        </div>
      ),
      { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: color, color: "#fff", fontSize: size * (maskable ? 0.42 : 0.55), fontWeight: 700,
          borderRadius: maskable || size === 180 ? 0 : size * 0.22,
        }}
      >
        {initial}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
