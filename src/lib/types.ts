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
  country: string;
  timezone: string; // IANA, e.g. "Asia/Dubai"
  phone_country_code: string; // digits, e.g. "971"
  currency: string;
  currency_symbol: string;
  currency_decimals: number;
  expense_categories: string[];
  // loyalty
  loyalty_enabled: boolean;
  loyalty_every: number;
  loyalty_kind: "percent" | "fixed";
  loyalty_value: number;
  loyalty_max: number | null;
  loyalty_min_order: number;
  summary_email: string;
  // branding
  logo_url: string;
  cover_url: string;
  brand_color: string;
  tagline: string;
  // languages
  languages: Lang[];
  default_language: Lang;
  delivery_fee: number;
  min_order: number;
  eta_minutes: number | null; // "delivery in about N min" on the menu
  vat_percent: number;
  trn: string;
  is_open: boolean;
  closed_message: string;
  whatsapp_templates: WhatsAppTemplates;
  card_enabled: boolean;
  // opening hours & scheduling
  auto_hours: boolean;
  hours: WeeklyHours;
  allow_asap: boolean;
  allow_scheduled: boolean;
  slot_minutes: number;
  slot_capacity: number;
  lead_minutes: number;
  days_ahead: number;
  // map
  require_pin: boolean;
  map_center_lat: number;
  map_center_lng: number;
};

/** "HH:MM" in the shop's time zone. close < open means it runs past midnight. */
export type TimeRange = { open: string; close: string };
/** Keyed "0".."6", 0 = Sunday. Missing or [] = closed that day. */
export type WeeklyHours = Partial<Record<string, TimeRange[]>>;

export type PromoKind = "percent" | "fixed" | "free_delivery";
export type PromoCode = {
  id: string;
  code: string;
  description: string;
  kind: PromoKind;
  value: number;
  min_order: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  first_order_only: boolean;
  active: boolean;
  created_at: string;
};

export type DeliveryZone = {
  id: string;
  name: string;
  fee: number;
  min_order: number | null;
  active: boolean;
  sort: number;
};

export type Lang = "en" | "ar" | "ur";
/** Translations of a text: {"ar": "...", "ur": "..."} (English is the main field). */
export type I18nText = Partial<Record<Lang, string>>;

export type Category = { id: string; name: string; sort: number; name_i18n?: I18nText };

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
  daily_limit: number | null;
  cost?: number | null;
  name_i18n?: I18nText;
  description_i18n?: I18nText;
  tags?: DishTag[];
};

/** Badges the owner can tick on a dish. "suggest" = offered at checkout. */
export type DishTag = "spicy" | "chef" | "new" | "suggest";

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
  unit_cost?: number | null;
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
  scheduled_for: string | null;
  promo_code: string | null;
  discount: number;
  location_lat: number | null;
  location_lng: number | null;
  driver_id?: string | null;
  driver_name?: string;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  lang?: Lang;
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

export type ExpensePaidWith = "cash" | "card" | "bank";
export type Expense = {
  id: string;
  spent_on: string; // YYYY-MM-DD (shop time zone)
  category: string;
  description: string;
  vendor: string;
  amount: number;
  paid_with: ExpensePaidWith;
  receipt_path: string | null;
  created_at: string;
};

export type Review = {
  id: string;
  order_id: string;
  rating: number;
  comment: string;
  customer_name: string;
  customer_phone: string;
  published: boolean;
  seen: boolean;
  created_at: string;
};

export type CashHandover = {
  id: string;
  driver_id: string;
  driver_name: string;
  amount: number;
  note: string;
  received_by_name: string;
  created_at: string;
};
