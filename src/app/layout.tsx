import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getSettings } from "@/lib/data";
import { DEFAULT_BRAND, brandStyle } from "@/lib/brand";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = {
    title: "Home Kitchen",
    description: "Order fresh home-cooked food",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Order", statusBarStyle: "default" },
    icons: { icon: "/app-icon/192", apple: "/app-icon/180" },
  };
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
    const s = await getSettings();
    const description = s.tagline ? `${s.tagline} — order online` : `Order online from ${s.name}`;
    // Link preview card for WhatsApp / Instagram / Facebook (image from /share-image).
    return {
      ...base,
      metadataBase: host ? new URL(`${proto}://${host}`) : undefined,
      openGraph: {
        type: "website",
        siteName: s.name,
        title: s.name,
        description,
        images: [{ url: `/share-image?v=${encodeURIComponent(String((s as { updated_at?: string }).updated_at ?? "").slice(0, 19))}`, width: 1200, height: 630, alt: s.name }],
      },
      twitter: { card: "summary_large_image", title: s.name, description },
    };
  } catch {
    return base; // e.g. during build
  }
}

// Brand colour comes from Settings, so pages must not be frozen at build time.
export const dynamic = "force-dynamic";

async function brandColor() {
  try {
    return (await getSettings()).brand_color;
  } catch {
    return DEFAULT_BRAND; // e.g. during build, before the database is reachable
  }
}

export async function generateViewport(): Promise<Viewport> {
  return { width: "device-width", initialScale: 1, themeColor: await brandColor() };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const style = brandStyle(await brandColor());
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased" style={style}>
        {children}
      </body>
    </html>
  );
}
