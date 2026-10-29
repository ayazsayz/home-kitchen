import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

/** App icon: the restaurant's initial on the brand colour (no logo upload needed). */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const size = [180, 192, 512].includes(Number(raw)) ? Number(raw) : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  let name = "Home Kitchen";
  try {
    name = (await getSettings()).name || name;
  } catch {}
  const initial = (name.trim()[0] || "K").toUpperCase();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#c2410c", color: "#fff", fontSize: size * (maskable ? 0.42 : 0.55), fontWeight: 700,
          borderRadius: maskable || size === 180 ? 0 : size * 0.22,
        }}
      >
        {initial}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
