import { getAvailability, getSettings, getZones } from "@/lib/data";
import { cardAvailable } from "@/lib/payments/service";
import CheckoutClient from "@/components/CheckoutClient";
import CustomerShell from "@/components/CustomerShell";
import { currentLang, offeredLangs } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function Checkout() {
  const [settings, zones] = await Promise.all([getSettings(), getZones()]);
  const [availability, lang] = await Promise.all([getAvailability(settings), currentLang(settings)]);
  return (
    <CustomerShell lang={lang} langs={offeredLangs(settings)}>
    <CheckoutClient
      settings={{ ...settings, card_enabled: cardAvailable(settings), whatsapp_templates: {}, summary_email: "" }}
      availability={availability}
      zones={zones}
      googleMapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
    />
    </CustomerShell>
  );
}
