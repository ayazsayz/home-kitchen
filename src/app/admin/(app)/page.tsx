import OrdersBoard from "@/components/admin/OrdersBoard";
import { currentStaff } from "@/lib/require-staff";

export default async function OrdersPage() {
  const me = await currentStaff();
  return <OrdersBoard role={me?.role ?? "cook"} />;
}
