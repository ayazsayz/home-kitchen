import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder, getSettings } from "@/lib/data";
import { money, timeShort } from "@/lib/format";
import { optionsText } from "@/lib/options";
import { cardAvailable, syncPayment } from "@/lib/payments/service";
import type { OrderStatus } from "@/lib/types";
import { fmtWhen } from "@/lib/schedule";
import AutoRefresh from "@/components/AutoRefresh";
import PaymentActions from "@/components/PaymentActions";

export const dynamic = "force-dynamic";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "new", label: "Order received" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Cooking" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "On the way" },
  { key: "completed", label: "Done" },
];

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { id } = await params;
  const { payment } = await searchParams;

  let order = await getOrder(id);
  if (!order) notFound();
  if (order.status === "pending_payment") {
    // Returning from the payment page (or refreshing): ask the provider for the real status.
    // (Applied locally: a second identical fetch in the same render would be deduped by Next.js.)
    const result = await syncPayment(order.id).catch((e) => {
      console.error("syncPayment", e);
      return null;
    });
    if (result === "paid") order = { ...order, status: "new", payment_status: "paid" };
    else if (result === "failed") order = { ...order, payment_status: "failed" };
  }
  const settings = await getSettings();

  const c = settings.currency;
  const steps = STEPS.filter((s) => !(order.order_type === "pickup" && s.key === "out_for_delivery"));
  const current = steps.findIndex((s) => s.key === order.status);
  const finished = order.status === "completed" || order.status === "rejected";
  const awaitingPayment = order.status === "pending_payment";
  const paid = order.payment_status === "paid";

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      {!finished && <AutoRefresh seconds={awaitingPayment ? 5 : 15} />}
      <div>
        <p className="text-sm text-muted">{settings.name}</p>
        <h1 className="text-2xl font-bold">Order #{order.order_no}</h1>
        <p className="text-sm text-muted">Placed {timeShort(order.created_at)}</p>
        {order.scheduled_for && (
          <p className="mt-2 inline-block rounded-lg bg-brand/10 px-3 py-1 font-medium text-brand-dark">
            ⏰ {order.order_type === "pickup" ? "Pickup" : "Delivery"} {fmtWhen(order.scheduled_for)}
          </p>
        )}
      </div>

      {awaitingPayment ? (
        <div className="card space-y-3 p-4">
          {payment === "done" && order.payment_status !== "failed" ? (
            <p>Confirming your payment… this page updates automatically.</p>
          ) : (
            <p>
              {order.payment_status === "failed" || payment === "cancelled"
                ? "Your payment didn't go through. Your order has not been sent to the kitchen yet."
                : "Your order is waiting for payment."}
            </p>
          )}
          <PaymentActions orderId={order.id} canPayCard={cardAvailable(settings)} />
        </div>
      ) : order.status === "rejected" ? (
        <div className="card border-red-200 bg-red-50 p-4 text-red-800">
          Sorry, we couldn&apos;t take this order. {settings.phone && <>Please call {settings.phone}.</>}
          {paid && <> Your card payment will be refunded.</>}
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
          <div key={i.id} className="flex justify-between gap-3 p-3">
            <span>
              {i.qty} × {i.name}
              {i.options?.length > 0 && <span className="block text-sm text-muted">{optionsText(i.options)}</span>}
            </span>
            <span className="whitespace-nowrap">{money(i.line_total, c)}</span>
          </div>
        ))}
        {order.order_type === "delivery" && (
          <div className="flex justify-between p-3 text-muted">
            <span>Delivery{order.zone_name ? ` · ${order.zone_name}` : ""}</span>
            <span>{money(order.delivery_fee, c)}</span>
          </div>
        )}
        {order.discount > 0 && (
          <div className="flex justify-between p-3 text-ok">
            <span>Discount{order.promo_code ? ` · ${order.promo_code}` : ""}</span>
            <span>− {money(order.discount, c)}</span>
          </div>
        )}
        <div className="flex justify-between p-3 font-bold">
          <span>{paid ? "Paid by card ✓" : awaitingPayment ? "Total" : `Pay on ${order.order_type === "pickup" ? "pickup" : "delivery"}`}</span>
          <span>{money(order.total, c)}</span>
        </div>
      </section>

      {settings.phone && (
        <a href={`tel:${settings.phone}`} className="btn-ghost w-full">Call {settings.name}</a>
      )}
      <p className="text-center text-sm text-muted">
        Bookmark this page to check your order. <Link href="/" className="text-brand">Order again</Link>
      </p>
    </div>
  );
}
