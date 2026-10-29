import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Home Kitchen",
  description: "Order fresh home-cooked food",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Order", statusBarStyle: "default" },
  icons: { icon: "/app-icon/192", apple: "/app-icon/180" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#c2410c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
