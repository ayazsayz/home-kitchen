/**
 * How this copy of the app is installed (APP_MODE, read on the server at run time):
 *  - online  (default): Vercel + Supabase Cloud.
 *  - docker:  on the client's own PC/server with Supabase in Docker (internet optional).
 *  - offline: shop laptop with no internet — the customer website is switched off, staff take orders in the shop.
 * Individual features can be forced with FEATURE_CUSTOMER_SITE=on|off.
 * Card payments, WhatsApp/email and maps already switch themselves off when their keys aren't set.
 */
export type AppMode = "online" | "docker" | "offline";

export function appMode(): AppMode {
  const m = (process.env.APP_MODE || "").toLowerCase();
  return m === "docker" || m === "offline" ? m : "online";
}

const flag = (name: string, fallback: boolean) => {
  const v = (process.env[name] || "").toLowerCase();
  return v === "on" || v === "true" ? true : v === "off" || v === "false" ? false : fallback;
};

export type Features = {
  /** customer menu, checkout and order tracking pages */
  customerSite: boolean;
  /** the app's own server is on the shop's network (docker/offline): staff screens don't depend on the internet */
  localServer: boolean;
};

export function features(mode: AppMode = appMode()): Features {
  return {
    customerSite: flag("FEATURE_CUSTOMER_SITE", mode !== "offline"),
    localServer: mode !== "online",
  };
}
