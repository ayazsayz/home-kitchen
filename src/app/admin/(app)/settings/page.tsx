import SettingsForm from "@/components/admin/SettingsForm";
import ZonesEditor from "@/components/admin/ZonesEditor";
import { getProvider } from "@/lib/payments/providers";

export default function SettingsPage() {
  const provider = getProvider();
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
      <SettingsForm paymentProvider={provider?.name ?? null} />
      <ZonesEditor />
    </div>
  );
}
