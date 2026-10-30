import Link from "next/link";
import { getSettings } from "@/lib/data";
import { currencyOf } from "@/lib/format";
import { cardAvailable } from "@/lib/payments/service";
import { REGIONS } from "@/lib/region";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  try {
    const s = await getSettings();
    return { title: `Privacy & Terms — ${s.name}` };
  } catch {
    return { title: "Privacy & Terms" };
  }
}

/** Plain-language privacy policy and terms, filled in from Settings. */
export default async function LegalPage() {
  const s = await getSettings();
  const card = cardAvailable(s);
  const country = REGIONS.find((r) => r.country === s.country)?.name ?? s.country;
  const contact = [s.phone && `phone/WhatsApp ${s.phone}`, s.address].filter(Boolean).join(", ");
  const updated = new Date().toLocaleDateString("en-GB", { timeZone: s.timezone, year: "numeric", month: "long" });
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 leading-relaxed" lang="en" dir="ltr">
      <div>
        <Link href="/" className="text-sm text-brand">← Back to the menu</Link>
        <h1 className="mt-2 text-3xl font-extrabold">Privacy & Terms</h1>
        <p className="text-sm text-muted">{s.name}{country ? ` · ${country}` : ""} · Updated {updated}</p>
      </div>

      <section id="privacy" className="space-y-3">
        <h2 className="text-xl font-bold">Privacy policy</h2>
        <p><b>What we collect.</b> When you order we ask for your name, mobile number, delivery address and, if you choose, your location on the map. We keep your orders, any notes you add, ratings you leave, and the promo codes or loyalty rewards you use.</p>
        <p><b>Why.</b> To prepare and deliver your order, contact you about it (by phone or WhatsApp), run our loyalty stamp card, prevent fake orders, and understand which dishes are popular. We do not sell your information or use it for advertising by others.</p>
        <p><b>Payments.</b> {card ? "Card payments are handled by our payment provider on their secure page; we never see or store your card number." : "We take cash. We never ask for card details on this site."}</p>
        <p><b>On your device.</b> Your cart, your details for next time and your language choice are saved in your browser so you don&apos;t have to type them again. We don&apos;t use advertising or tracking cookies.</p>
        <p><b>Who can see it.</b> Only our staff and our delivery drivers, as needed for your order, and the services that run this website (hosting, database, email). To stop repeated fake orders we keep an anonymous code for the device used to order — not your IP address.</p>
        <p><b>How long.</b> We keep order records for our accounts. You can ask us to see, correct or delete your information at any time{contact ? ` (${contact})` : ""}.</p>
      </section>

      <section id="terms" className="space-y-3">
        <h2 className="text-xl font-bold">Terms of ordering</h2>
        <p><b>Orders.</b> An order is confirmed when we accept it; you can follow it on your order page. We may refuse or cancel an order (for example if we run out of a dish or can&apos;t reach you), and we&apos;ll let you know.</p>
        <p><b>Prices.</b> Prices are in {currencyOf(s).code}{Number(s.vat_percent) > 0 ? ` and include ${s.vat_percent}% VAT` : ""}. Delivery fees and any discounts are shown before you place your order.</p>
        <p><b>Payment.</b> {card ? "Pay by card when ordering, or in cash on delivery/pickup if offered." : "Pay in cash on delivery or pickup."} Please have the amount ready.</p>
        <p><b>Changes & cancellations.</b> Call or WhatsApp us as soon as possible. Once cooking has started we may not be able to change or cancel. If a card-paid order is cancelled by us, it&apos;s refunded to your card.</p>
        <p><b>Delivery times</b> are estimates and can change at busy times or in bad weather.</p>
        <p><b>Allergies.</b> Our food is home-cooked in a kitchen that handles nuts, dairy, gluten, eggs and other allergens. Tell us about allergies in your order notes or call us before ordering.</p>
        {s.legal_extra?.trim() && <div className="whitespace-pre-wrap">{s.legal_extra}</div>}
        <p><b>Contact.</b> {s.name}{contact ? ` — ${contact}` : ""}.</p>
      </section>
    </div>
  );
}
