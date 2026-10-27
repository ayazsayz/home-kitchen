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
};

export type Category = { id: string; name: string; sort: number };

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  price: number;
  image_url: string;
  available: boolean;
  sort: number;
};

export type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "rejected";

export type OrderItem = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  unit_price: number;
  qty: number;
  line_total: number;
};

export type Order = {
  id: string;
  order_no: number;
  status: OrderStatus;
  order_type: "delivery" | "pickup";
  customer_name: string;
  customer_phone: string;
  address: string;
  notes: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  vat_percent: number;
  payment_method: string;
  printed_at: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

export type CartLine = { id: string; name: string; price: number; qty: number };

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  rejected: "Rejected",
};
