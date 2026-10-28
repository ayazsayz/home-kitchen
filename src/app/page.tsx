import { getMenu, getSettings } from "@/lib/data";
import { cardAvailable } from "@/lib/payments/service";
import MenuClient from "@/components/MenuClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, menu] = await Promise.all([getSettings(), getMenu()]);
  return (
    <MenuClient
      settings={{ ...settings, card_enabled: cardAvailable(settings), whatsapp_templates: {} }}
      categories={menu.categories}
      items={menu.items}
    />
  );
}
