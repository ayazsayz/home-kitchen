import { getAvailability, getMenu, getSettings } from "@/lib/data";
import { cardAvailable } from "@/lib/payments/service";
import { remainingFor, soldByDay } from "@/lib/stock";
import { todayIn } from "@/lib/tz";
import MenuClient from "@/components/MenuClient";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  try {
    const s = await getSettings();
    return { title: s.name, description: `Order from ${s.name}`, appleWebApp: { capable: true, title: s.name } };
  } catch {
    return {};
  }
}

export default async function Home() {
  const [settings, menu] = await Promise.all([getSettings(), getMenu()]);
  const limited = menu.items.filter((i) => i.daily_limit != null);
  const [availability, sold] = await Promise.all([
    getAvailability(settings),
    limited.length ? soldByDay(settings.timezone, 0) : Promise.resolve({}),
  ]);
  return (
    <MenuClient
      settings={{ ...settings, card_enabled: cardAvailable(settings), whatsapp_templates: {}, summary_email: "" }}
      availability={availability}
      categories={menu.categories}
      items={menu.items}
      remaining={remainingFor(limited, sold, todayIn(settings.timezone))}
    />
  );
}
