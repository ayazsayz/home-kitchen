import { currencyOf, money } from "./format";
import { fmtWhen } from "./schedule";
import type { Lang, Order, OrderStatus, Settings, WhatsAppTemplates } from "./types";

/** Placeholders available in templates. */
export const PLACEHOLDERS = ["{name}", "{order_no}", "{total}", "{when}", "{payment_line}", "{ready_line}", "{link}", "{menu}", "{restaurant}"];

/** Statuses a customer can be messaged about, in order. */
export const NOTIFY_STATUSES: OrderStatus[] = ["accepted", "preparing", "ready", "out_for_delivery", "completed", "rejected"];

type MessageStatus = Exclude<OrderStatus, "pending_payment">;
export const DEFAULT_TEMPLATES: Record<MessageStatus, string> = {
  new: "Hi {name}, we received your order #{order_no} ({total}). Track it here: {link}",
  accepted: "Hi {name}, your order #{order_no} from {restaurant} is confirmed ✅ ({when}). Track it here: {link}",
  preparing: "Hi {name}, we're cooking your order #{order_no} now 🍳",
  ready: "Hi {name}, your order #{order_no} is ready! {ready_line}",
  out_for_delivery: "Hi {name}, your order #{order_no} is on the way 🛵 {payment_line}",
  completed: "Thank you {name}! Hope you enjoyed your meal from {restaurant} 🙏 How was it? Rate your order: {link} · Order again: {menu}",
  rejected: "Hi {name}, sorry, we can't take order #{order_no} right now. Please call us if you have any questions.",
};

/** Default messages for customers who ordered in Arabic or Urdu. */
const TRANSLATED: Record<Exclude<Lang, "en">, Record<MessageStatus, string>> = {
  ar: {
    new: "مرحباً {name}، استلمنا طلبك رقم {order_no} ({total}). تابعه هنا: {link}",
    accepted: "مرحباً {name}، تم تأكيد طلبك رقم {order_no} من {restaurant} ✅ ({when}). تابعه هنا: {link}",
    preparing: "مرحباً {name}، نحضّر طلبك رقم {order_no} الآن 🍳",
    ready: "مرحباً {name}، طلبك رقم {order_no} جاهز! {ready_line}",
    out_for_delivery: "مرحباً {name}، طلبك رقم {order_no} في الطريق 🛵 {payment_line}",
    completed: "شكراً {name}! نتمنى أن تكون استمتعت بوجبتك من {restaurant} 🙏 قيّم طلبك: {link} · اطلب مرة أخرى: {menu}",
    rejected: "مرحباً {name}، عذراً، لا يمكننا قبول الطلب رقم {order_no} الآن. يرجى الاتصال بنا لأي استفسار.",
  },
  ur: {
    new: "السلام علیکم {name}، آپ کا آرڈر نمبر {order_no} ({total}) موصول ہو گیا۔ یہاں دیکھیں: {link}",
    accepted: "{name}، {restaurant} سے آپ کا آرڈر نمبر {order_no} کنفرم ہو گیا ✅ ({when})۔ یہاں دیکھیں: {link}",
    preparing: "{name}، ہم آپ کا آرڈر نمبر {order_no} ابھی تیار کر رہے ہیں 🍳",
    ready: "{name}، آپ کا آرڈر نمبر {order_no} تیار ہے! {ready_line}",
    out_for_delivery: "{name}، آپ کا آرڈر نمبر {order_no} راستے میں ہے 🛵 {payment_line}",
    completed: "شکریہ {name}! امید ہے {restaurant} کا کھانا پسند آیا ہوگا 🙏 اپنے آرڈر کی ریٹنگ دیں: {link} · دوبارہ آرڈر کریں: {menu}",
    rejected: "{name}، معذرت، ہم ابھی آرڈر نمبر {order_no} نہیں لے سکتے۔ کسی سوال کے لیے ہمیں کال کریں۔",
  },
};
const LINES: Record<Exclude<Lang, "en">, { asap: string; delivery: string; pickup: string; paid: string; cash: string; pickupNow: string; soon: string }> = {
  ar: { asap: "في أقرب وقت", delivery: "التوصيل", pickup: "الاستلام", paid: "تم الدفع ✓", cash: "يرجى تجهيز {amount} نقداً.", pickupNow: "يمكنك استلامه الآن.", soon: "سيصلك قريباً." },
  ur: { asap: "جتنی جلدی ممکن ہو", delivery: "ڈیلیوری", pickup: "وصولی", paid: "ادائیگی ہو چکی ✓", cash: "براہ کرم {amount} نقد تیار رکھیں۔", pickupNow: "آپ ابھی لے جا سکتے ہیں۔", soon: "جلد آپ تک پہنچ جائے گا۔" },
};

/** Owner's custom template (written in English) or the default; Arabic/Urdu orders get the translated default. */
export function templateFor(status: OrderStatus, custom: WhatsAppTemplates | undefined, lang: Lang = "en") {
  if (status === "pending_payment") return "";
  if (lang !== "en" && TRANSLATED[lang]) return TRANSLATED[lang][status];
  return custom?.[status]?.trim() || DEFAULT_TEMPLATES[status];
}

export function renderMessage(
  status: OrderStatus,
  order: Pick<Order, "id" | "order_no" | "customer_name" | "total" | "order_type" | "payment_status"> &
    Partial<Pick<Order, "scheduled_for" | "lang">>,
  settings: Pick<Settings, "name" | "currency" | "whatsapp_templates"> & Partial<Pick<Settings, "currency_symbol" | "currency_decimals" | "timezone">>,
  origin: string,
) {
  const cur = currencyOf(settings);
  const lang: Lang = order.lang === "ar" || order.lang === "ur" ? order.lang : "en";
  if (lang !== "en") {
    const L = LINES[lang];
    const vars: Record<string, string> = {
      name: order.customer_name.split(" ")[0] || order.customer_name,
      order_no: String(order.order_no),
      total: money(order.total, cur),
      when: order.scheduled_for
        ? `${order.order_type === "pickup" ? L.pickup : L.delivery} ${fmtWhen(order.scheduled_for, settings.timezone, undefined, lang)}`
        : L.asap,
      payment_line: order.payment_status === "paid" ? L.paid : L.cash.replace("{amount}", money(order.total, cur)),
      link: `${origin}/order/${order.id}`,
      menu: origin,
      restaurant: settings.name,
      ready_line: order.order_type === "pickup" ? L.pickupNow : L.soon,
    };
    return templateFor(status, settings.whatsapp_templates, lang).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
  }
  const vars: Record<string, string> = {
    name: order.customer_name.split(" ")[0] || order.customer_name,
    order_no: String(order.order_no),
    total: money(order.total, cur),
    when: order.scheduled_for
      ? `${order.order_type === "pickup" ? "pickup" : "delivery"} ${fmtWhen(order.scheduled_for, settings.timezone)}`
      : "as soon as possible",
    payment_line:
      order.payment_status === "paid"
        ? "Already paid ✓"
        : `Please keep ${money(order.total, cur)} ready in cash.`,
    link: `${origin}/order/${order.id}`,
    menu: origin,
    restaurant: settings.name,
    ready_line: order.order_type === "pickup" ? "You can pick it up now." : "It will be with you shortly.",
  };
  return templateFor(status, settings.whatsapp_templates).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

/** wa.me link that opens WhatsApp with the message ready to send. */
export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
