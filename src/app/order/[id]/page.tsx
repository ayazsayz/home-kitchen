import Link from "next/link";
import { notFound } from "next/navigation";
import { getMenu, getOrder, getSettings } from "@/lib/data";
import { reorderLines } from "@/lib/reorder";
import ReorderButton from "@/components/ReorderButton";
import { LanguageSwitcher } from "@/components/I18n";
import { currencyOf, money, timeShort } from "@/lib/format";
import { optionsText } from "@/lib/options";
import { cardAvailable, syncPayment } from "@/lib/payments/service";
import type { OrderStatus } from "@/lib/types";
import { fmtWhen } from "@/lib/schedule";
import AutoRefresh from "@/components/AutoRefresh";
import Stamps from "@/components/Stamps";
import { loyaltyText } from "@/lib/loyalty";
import { loyaltyStatus } from "@/lib/loyalty-server";
import PaymentActions from "@/components/PaymentActions";
import CustomerShell from "@/components/CustomerShell";
import RateOrder from "@/components/RateOrder";
import { currentLang, offeredLangs } from "@/lib/lang-server";
import { LOCALE, localize, t as tr, type Key } from "@/lib/i18n";
import { reviewFor } from "@/lib/reviews-server";

export const dynamic = "force-dynamic";

const STEPS: { key: OrderStatus; label: Key }[] = [
  { key: "new", label: "stReceived" },
  { key: "accepted", label: "stAccepted" },
  { key: "preparing", label: "stCooking" },
  { key: "ready", label: "stReady" },
  { key: "out_for_delivery", label: "stOnTheWay" },
  { key: "completed", label: "stDone" },
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
  const lang = await currentLang(settings);
  const t = (k: Key, v?: Record<string, string | number>) => tr(lang, k, v);
  const menuItems = (await getMenu()).items;
  const reorder = order.status === "pending_payment" ? null : reorderLines(order.order_items ?? [], menuItems, lang);
  const itemName = (id: string | null | undefined, name: string) => {
    const m = lang === "en" ? undefined : menuItems.find((x) => x.id === id);
    return m ? localize(m.name, m.name_i18n, lang) : name;
  };
  const stampCard =
    settings.loyalty_enabled && !["rejected", "pending_payment"].includes(order.status)
      ? await loyaltyStatus(order.customer_phone, settings, currencyOf(settings), lang)
      : null;
  const review = order.status === "completed" ? await reviewFor(order.id).catch(() => null) : null;
  const placedAt =
    lang === "en"
      ? timeShort(order.created_at, settings.timezone)
      : new Date(order.created_at).toLocaleString(LOCALE[lang], { timeZone: settings.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const c = currencyOf(settings);
  const steps = STEPS.filter((s) => !(order.order_type === "pickup" && s.key === "out_for_delivery"));
  const current = steps.findIndex((s) => s.key === order.status);
  const finished = order.status === "completed" || order.status === "rejected";
  const awaitingPayment = order.status === "pending_payment";
  const paid = order.payment_status === "paid";

  return (
    <CustomerShell lang={lang} langs={offeredLangs(settings)}>
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      {!finished && <AutoRefresh seconds={awaitingPayment ? 5 : 15} />}
      <div>
        <p className="text-sm text-muted">{settings.name}</p>
        <h1 className="text-2xl font-bold">{t("orderNo", { n: order.order_no })}</h1>
        <p className="text-sm text-muted">{t("placed", { time: placedAt })}</p>
        {order.scheduled_for && (
          <p className="mt-2 inline-block rounded-lg bg-brand/10 px-3 py-1 font-medium text-brand-dark">
            {t(order.order_type === "pickup" ? "scheduledPickup" : "scheduledDelivery", { when: fmtWhen(order.scheduled_for, settings.timezone, undefined, lang) })}
          </p>
        )}
      </div>

      {awaitingPayment ? (
        <div className="card space-y-3 p-4">
          {payment === "done" && order.payment_status !== "failed" ? (
            <p>{t("confirmingPay")}</p>
          ) : (
            <p>
              {order.payment_status === "failed" || payment === "cancelled"
                ? t("payFailed")
                : t("waitingPay")}
            </p>
          )}
          <PaymentActions orderId={order.id} canPayCard={cardAvailable(settings)} />
        </div>
      ) : order.status === "rejected" ? (
        <div className="card border-red-200 bg-red-50 p-4 text-red-800">
          {t("rejectedMsg")} {settings.phone && <>{t("callUs", { phone: settings.phone })}</>}
          {paid && <> {t("refund")}</>}
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
              <span className={i === current ? "font-semibold" : i < current ? "" : "text-muted"}>{t(s.label)}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="card divide-y divide-line">
        {order.order_items?.map((i) => (
          <div key={i.id} className="flex justify-between gap-3 p-3">
            <span>
              {i.qty} × {itemName(i.menu_item_id, i.name)}
              {i.options?.length > 0 && <span className="block text-sm text-muted">{optionsText(i.options)}</span>}
            </span>
            <span className="whitespace-nowrap">{money(i.line_total, c)}</span>
          </div>
        ))}
        {order.order_type === "delivery" && (
          <div className="flex justify-between p-3 text-muted">
            <span>{t("delivery")}{order.zone_name ? ` · ${order.zone_name}` : ""}</span>
            <span>{money(order.delivery_fee, c)}</span>
          </div>
        )}
        {order.discount > 0 && (
          <div className="flex justify-between p-3 text-ok">
            <span>{order.promo_code === "LOYALTY" ? `⭐ ${t("loyaltyReward")}` : `${t("discount")}${order.promo_code ? ` · ${order.promo_code}` : ""}`}</span>
            <span>− {money(order.discount, c)}</span>
          </div>
        )}
        <div className="flex justify-between p-3 font-bold">
          <span>{paid ? t("paidByCard") : awaitingPayment ? t("total") : t(order.order_type === "pickup" ? "payOnPickup" : "payOnDelivery")}</span>
          <span>{money(order.total, c)}</span>
        </div>
      </section>

      {order.status === "completed" && <RateOrder orderId={order.id} existing={review} />}

      {reorder && <ReorderButton lines={reorder.lines} skipped={reorder.skipped} className="btn-ghost w-full" />}

      {stampCard && (
        <section className="card space-y-2 p-4" data-testid="order-loyalty">
          <div className="flex items-center justify-between text-sm">
            <b>{t("yourStampCard")}</b>
            <span className="text-muted">{stampCard.stamps}/{stampCard.every - 1}</span>
          </div>
          <Stamps s={stampCard} />
          <p className="text-sm">{loyaltyText(stampCard, currencyOf(settings), lang)}</p>
        </section>
      )}

      {settings.phone && (
        <a href={`tel:${settings.phone}`} className="btn-ghost w-full">{t("callShop", { name: settings.name })}</a>
      )}
      <p className="text-center text-sm text-muted">
        {t("bookmark")} <Link href="/" className="text-brand">{t("orderAgainLink")}</Link>
      </p>
      <div className="flex justify-center"><LanguageSwitcher /></div>
    </div>
    </CustomerShell>
  );
}
