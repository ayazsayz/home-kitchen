import "server-only";

/**
 * Card payment providers. To add another gateway (Telr, Network International, …),
 * implement PaymentProvider and register it in `getProvider()`.
 */
export type CheckoutInput = {
  orderId: string;
  orderNo: number;
  amount: number; // major units, e.g. 32.50
  currency: string; // ISO code, e.g. "AED"
  description: string;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentCheck = "paid" | "pending" | "failed";

export interface PaymentProvider {
  name: string;
  createCheckout(input: CheckoutInput): Promise<{ ref: string; redirectUrl: string }>;
  check(ref: string): Promise<PaymentCheck>;
}

// ISO 4217 minor units (what payment APIs expect) — not the same as how prices are shown
// (e.g. PKR is displayed without decimals but still has 2 minor units).
const THREE = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
const ZERO = ["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"];
const exponent = (code: string) => (THREE.includes(code) ? 3 : ZERO.includes(code) ? 0 : 2);
const minor = (n: number, code: string) => {
  const v = Math.round(n * 10 ** exponent(code));
  return exponent(code) === 3 ? Math.round(v / 10) * 10 : v; // Stripe requires 3-decimal amounts to end in 0
};

// ---------- Ziina (UAE) — https://docs.ziina.com ----------
function ziina(apiKey: string, test: boolean): PaymentProvider {
  const base = "https://api-v2.ziina.com/api";
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  return {
    name: "ziina",
    async createCheckout(i) {
      const res = await fetch(`${base}/payment_intent`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          amount: minor(i.amount, i.currency.toUpperCase()),
          currency_code: i.currency,
          message: i.description,
          success_url: i.successUrl,
          cancel_url: i.cancelUrl,
          failure_url: i.cancelUrl,
          test,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id || !data.redirect_url) {
        throw new Error(`Ziina: ${data.message || data.error || res.status}`);
      }
      return { ref: data.id, redirectUrl: data.redirect_url };
    },
    async check(ref) {
      const res = await fetch(`${base}/payment_intent/${encodeURIComponent(ref)}`, { headers, cache: "no-store" });
      if (!res.ok) return "pending";
      const { status } = await res.json();
      if (status === "completed") return "paid";
      if (status === "failed" || status === "canceled") return "failed";
      return "pending";
    },
  };
}

// ---------- Stripe Checkout — https://docs.stripe.com/api/checkout/sessions ----------
function stripe(secretKey: string): PaymentProvider {
  const base = "https://api.stripe.com/v1";
  const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" };
  return {
    name: "stripe",
    async createCheckout(i) {
      const body = new URLSearchParams({
        mode: "payment",
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        client_reference_id: i.orderId,
        "metadata[order_id]": i.orderId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": i.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(minor(i.amount, i.currency.toUpperCase())),
        "line_items[0][price_data][product_data][name]": i.description,
      });
      const res = await fetch(`${base}/checkout/sessions`, { method: "POST", headers, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id || !data.url) throw new Error(`Stripe: ${data.error?.message || res.status}`);
      return { ref: data.id, redirectUrl: data.url };
    },
    async check(ref) {
      const res = await fetch(`${base}/checkout/sessions/${encodeURIComponent(ref)}`, { headers, cache: "no-store" });
      if (!res.ok) return "pending";
      const s = await res.json();
      if (s.payment_status === "paid") return "paid";
      if (s.status === "expired") return "failed";
      return "pending";
    },
  };
}

/** Returns the configured provider, or null if card payments aren't set up. */
export function getProvider(): PaymentProvider | null {
  const p = (process.env.PAYMENT_PROVIDER || "").toLowerCase();
  if (p === "ziina" && process.env.ZIINA_API_KEY) {
    return ziina(process.env.ZIINA_API_KEY, process.env.ZIINA_TEST_MODE === "true");
  }
  if (p === "stripe" && process.env.STRIPE_SECRET_KEY) return stripe(process.env.STRIPE_SECRET_KEY);
  return null;
}
