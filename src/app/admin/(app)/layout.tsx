import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AdminNav />
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
