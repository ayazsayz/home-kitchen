import { getAvailability, getMenu, getSettings } from "@/lib/data";
import { cardAvailable } from "@/lib/payments/service";
import MenuClient from "@/components/MenuClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, menu] = await Promise.all([getSettings(), getMenu()]);
  const availability = await getAvailability(settings);
  return (
    <MenuClient
      settings={{ ...settings, card_enabled: cardAvailable(settings), whatsapp_templates: {} }}
      availability={availability}
      categories={menu.categories}
      items={menu.items}
    />
  );
}
