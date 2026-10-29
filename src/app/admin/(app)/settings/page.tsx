import SettingsForm from "@/components/admin/SettingsForm";
import ZonesEditor from "@/components/admin/ZonesEditor";
import { getProvider } from "@/lib/payments/providers";

export default function SettingsPage() {
  const provider = getProvider();
  return (
    <div className="mx-auto max-w-5xl">
      <SettingsForm paymentProvider={provider?.name ?? null} zones={<ZonesEditor />} />
    </div>
  );
}
