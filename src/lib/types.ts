export type OrderStatus =
  | "pending_payment"
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "rejected";

export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed";
export type PaymentMethod = "cod" | "card";

/** WhatsApp message per status. Placeholders: {name} {order_no} {total} {link} {restaurant} */
export type WhatsAppTemplates = Partial<Record<OrderStatus, string>>;

export type Settings = {
  id: number;
  name: string;
  phone: string;
  address: string;
  currency: string;
  delivery_fee: number;
  min_order: number;
  vat_percent: number;
  trn: string;
  is_open: boolean;
  closed_message: string;
  whatsapp_templates: WhatsAppTemplates;
  card_enabled: boolean;
};

export type DeliveryZone = {
  id: string;
  name: string;
  fee: number;
  min_order: number | null;
  active: boolean;
  sort: number;
};

export type Category = { id: string; name: string; sort: number };

export type OptionChoice = { id: string; name: string; price: number; available?: boolean };
export type OptionGroup = {
  id: string;
  name: string;
  required: boolean;
  /** 1 = pick one; >1 = pick up to N */
  max: number;
  choices: OptionChoice[];
};

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  price: number;
  image_url: string;
  available: boolean;
  sort: number;
  option_groups: OptionGroup[];
};

/** What the customer picked, as stored on the order line. */
export type PickedOption = { group: string; name: string; price: number };

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  unit_price: number;
  qty: number;
  line_total: number;
  options: PickedOption[];
};

export type Order = {
  id: string;
  order_no: number;
  status: OrderStatus;
  order_type: "delivery" | "pickup";
  customer_name: string;
  customer_phone: string;
  address: string;
  zone_name: string;
  notes: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  vat_percent: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  printed_at: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

/** A cart line. `key` = item id + chosen option ids, so the same dish with different options is a separate line. */
export type CartLine = {
  key: string;
  id: string;
  name: string;
  /** unit price including options */
  price: number;
  qty: number;
  /** selected choice ids */
  choiceIds: string[];
  /** human-readable, e.g. ["Large", "Extra cheese"] */
  optionLabels: string[];
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  rejected: "Rejected",
};
