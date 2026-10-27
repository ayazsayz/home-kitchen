import { getSettings } from "@/lib/data";
import CheckoutClient from "@/components/CheckoutClient";

export const dynamic = "force-dynamic";

export default async function Checkout() {
  const settings = await getSettings();
  return <CheckoutClient settings={settings} />;
}
