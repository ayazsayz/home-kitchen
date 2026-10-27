import { getMenu, getSettings } from "@/lib/data";
import MenuClient from "@/components/MenuClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, menu] = await Promise.all([getSettings(), getMenu()]);
  return <MenuClient settings={settings} categories={menu.categories} items={menu.items} />;
}
