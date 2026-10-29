import DriverBoard from "@/components/admin/DriverBoard";
import { currentStaff } from "@/lib/require-staff";

export default async function DriverPage() {
  const me = await currentStaff();
  return <DriverBoard role={me?.role ?? "driver"} userId={me?.userId ?? ""} name={me?.name ?? ""} />;
}
