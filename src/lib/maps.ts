import type { Order } from "./types";

/** Google Maps link for the customer's pin (opens the Google Maps app on phones). */
export function mapsLink(o: Pick<Order, "location_lat" | "location_lng">) {
  if (o.location_lat == null || o.location_lng == null) return "";
  return `https://www.google.com/maps/search/?api=1&query=${o.location_lat},${o.location_lng}`;
}
