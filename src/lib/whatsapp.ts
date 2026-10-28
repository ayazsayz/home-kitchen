import { money } from "./format";
import { fmtWhen } from "./schedule";
import type { Order, OrderStatus, Settings, WhatsAppTemplates } from "./types";

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
  completed: "Thank you {name}! Hope you enjoyed your meal from {restaurant} 🙏 Order again: {menu}",
  rejected: "Hi {name}, sorry, we can't take order #{order_no} right now. Please call us if you have any questions.",
};

export function templateFor(status: OrderStatus, custom: WhatsAppTemplates | undefined) {
  const t = custom?.[status]?.trim();
  return t || (status === "pending_payment" ? "" : DEFAULT_TEMPLATES[status]);
}

export function renderMessage(
  status: OrderStatus,
  order: Pick<Order, "id" | "order_no" | "customer_name" | "total" | "order_type" | "payment_status"> &
    Partial<Pick<Order, "scheduled_for">>,
  settings: Pick<Settings, "name" | "currency" | "whatsapp_templates">,
  origin: string,
) {
  const vars: Record<string, string> = {
    name: order.customer_name.split(" ")[0] || order.customer_name,
    order_no: String(order.order_no),
    total: money(order.total, settings.currency),
    when: order.scheduled_for
      ? `${order.order_type === "pickup" ? "pickup" : "delivery"} ${fmtWhen(order.scheduled_for)}`
      : "as soon as possible",
    payment_line:
      order.payment_status === "paid"
        ? "Already paid ✓"
        : `Please keep ${money(order.total, settings.currency)} ready in cash.`,
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
