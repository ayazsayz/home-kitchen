import { getMenu, getSettings, getZones } from "@/lib/data";
import NewOrder from "@/components/admin/NewOrder";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [settings, menu, zones] = await Promise.all([getSettings(), getMenu(), getZones()]);
  return (
    <NewOrder
      settings={{ ...settings, whatsapp_templates: {}, summary_email: "" }}
      categories={menu.categories}
      items={menu.items.filter((i) => i.available).map(({ cost: _c, ...i }) => (void _c, i))}
      zones={zones}
    />
  );
}
