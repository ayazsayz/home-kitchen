import type { Metadata } from "next";
import AdminNav from "@/components/admin/AdminNav";
import { currentStaff } from "@/lib/require-staff";

export const metadata: Metadata = {
  title: "Kitchen",
  manifest: "/kitchen.webmanifest",
  appleWebApp: { capable: true, title: "Kitchen", statusBarStyle: "default" },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await currentStaff();
  return (
    <div className="min-h-dvh">
      <AdminNav role={me?.role ?? "cook"} name={me?.name ?? ""} />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
