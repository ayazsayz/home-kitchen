import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, getSettings } from "@/lib/data";
import { money, timeShort } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "new", label: "Order received" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Cooking" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "On the way" },
  { key: "completed", label: "Done" },
];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, settings] = await Promise.all([getOrder(id), getSettings()]);
  if (!order) notFound();

  const c = settings.currency;
  const steps = STEPS.filter((s) => !(order.order_type === "pickup" && s.key === "out_for_delivery"));
  const current = steps.findIndex((s) => s.key === order.status);
  const finished = order.status === "completed" || order.status === "rejected";

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      {!finished && <AutoRefresh seconds={15} />}
      <div>
        <p className="text-sm text-muted">{settings.name}</p>
        <h1 className="text-2xl font-bold">Order #{order.order_no}</h1>
        <p className="text-sm text-muted">{timeShort(order.created_at)}</p>
      </div>

      {order.status === "rejected" ? (
        <div className="card border-red-200 bg-red-50 p-4 text-red-800">
          Sorry, we couldn&apos;t take this order. {settings.phone && <>Please call {settings.phone}.</>}
        </div>
      ) : (
        <ol className="card space-y-3 p-4">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
                  i <= current ? "bg-ok text-white" : "border border-line text-muted"
                }`}
              >
                {i <= current ? "✓" : i + 1}
              </span>
              <span className={i === current ? "font-semibold" : i < current ? "" : "text-muted"}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="card divide-y divide-line">
        {order.order_items?.map((i) => (
          <div key={i.id} className="flex justify-between p-3">
            <span>
              {i.qty} × {i.name}
            </span>
            <span>{money(i.line_total, c)}</span>
          </div>
        ))}
        {order.delivery_fee > 0 && (
          <div className="flex justify-between p-3 text-muted">
            <span>Delivery</span>
            <span>{money(order.delivery_fee, c)}</span>
          </div>
        )}
        <div className="flex justify-between p-3 font-bold">
          <span>Pay on {order.order_type === "pickup" ? "pickup" : "delivery"}</span>
          <span>{money(order.total, c)}</span>
        </div>
      </section>

      {settings.phone && (
        <a href={`tel:${settings.phone}`} className="btn-ghost w-full">
          Call {settings.name}
        </a>
      )}
      <p className="text-center text-sm text-muted">
        Bookmark this page to check your order. <Link href="/" className="text-brand">Order again</Link>
      </p>
    </div>
  );
}
