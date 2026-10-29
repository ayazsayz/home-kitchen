import type { Metadata, Viewport } from "next";
import { getSettings } from "@/lib/data";
import { DEFAULT_BRAND, brandStyle } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "Home Kitchen",
  description: "Order fresh home-cooked food",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Order", statusBarStyle: "default" },
  icons: { icon: "/app-icon/192", apple: "/app-icon/180" },
};

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
