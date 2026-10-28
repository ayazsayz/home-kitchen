import { getAvailability, getSettings, getZones } from "@/lib/data";
import { cardAvailable } from "@/lib/payments/service";
import CheckoutClient from "@/components/CheckoutClient";

export const dynamic = "force-dynamic";

export default async function Checkout() {
  const [settings, zones] = await Promise.all([getSettings(), getZones()]);
  const availability = await getAvailability(settings);
  return (
    <CheckoutClient
      settings={{ ...settings, card_enabled: cardAvailable(settings), whatsapp_templates: {} }}
      availability={availability}
      zones={zones}
      googleMapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
    />
  );
}
