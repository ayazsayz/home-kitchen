"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

const LINKS = [
  { href: "/admin", label: "Orders" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/sales", label: "Sales" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav() {
  const path = usePathname();
  async function logout() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/admin/login";
  }
  return (
    <nav className="no-print sticky top-0 z-20 border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2">
        <span className="mr-3 font-bold text-brand">Kitchen</span>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              path === l.href ? "bg-brand/10 text-brand-dark" : "text-muted hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <span className="flex-1" />
        <Link href="/" target="_blank" className="px-3 py-1.5 text-sm text-muted">Shop ↗</Link>
        <button onClick={logout} className="px-3 py-1.5 text-sm text-muted">Log out</button>
      </div>
    </nav>
  );
}
