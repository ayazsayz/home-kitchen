import { redirect } from "next/navigation";
import { features } from "@/lib/mode";
import { getAvailability, getMenu, getSettings } from "@/lib/data";
import { cardAvailable } from "@/lib/payments/service";
import { remainingFor, soldByDay } from "@/lib/stock";
import { bizToday } from "@/lib/tz";
import { businessDayEnd } from "@/lib/schedule";
import MenuClient from "@/components/MenuClient";
import CustomerShell from "@/components/CustomerShell";
import { currentLang, offeredLangs } from "@/lib/lang-server";
import { menuReviews } from "@/lib/reviews-server";
import { bestSellers } from "@/lib/popular";

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
  if (!features().customerSite) redirect("/admin"); // offline install: staff screens only
  const [settings, menu] = await Promise.all([getSettings(), getMenu()]);
  const limited = menu.items.filter((i) => i.daily_limit != null);
  const [availability, sold, lang, rev, best] = await Promise.all([
    getAvailability(settings),
    limited.length ? soldByDay(settings.timezone, 0, businessDayEnd(settings)) : Promise.resolve({}),
    currentLang(settings),
    menuReviews().catch(() => null),
    bestSellers().catch(() => []),
  ]);
  return (
    <CustomerShell lang={lang} langs={offeredLangs(settings)}>
    <MenuClient
      settings={{ ...settings, card_enabled: cardAvailable(settings), whatsapp_templates: {}, summary_email: "" }}
      availability={availability}
      categories={menu.categories}
      items={menu.items}
      remaining={remainingFor(limited, sold, bizToday(settings.timezone, businessDayEnd(settings)))}
      rating={rev?.rating}
      reviews={rev?.reviews}
      bestsellers={best}
    />
    </CustomerShell>
  );
}
