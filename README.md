# Home Kitchen — online ordering + kitchen printing

Next.js 15 + Supabase. Customers order from their phone (cash on delivery or pickup); orders appear live on the kitchen dashboard, beep, and auto-print on an 80mm thermal printer.

## Pages

| URL | Who | What |
|---|---|---|
| `/` | Customers | Menu, search, cart |
| `/checkout` | Customers | Delivery/pickup, name, mobile, address, COD |
| `/order/<id>` | Customers | Live order status (auto-refreshes) |
| `/admin` | Staff | Live orders: accept → cooking → ready → delivered, reject, print, call/WhatsApp |
| `/admin/menu` | Staff | Categories, dishes, photos, prices, sold-out toggle |
| `/admin/sales` | Staff | Revenue, order count, best sellers, by-day, CSV export |
| `/admin/settings` | Staff | Open/closed, delivery areas & fees, card payments, WhatsApp messages, VAT/TRN, test print |

## Setup (≈15 min)

1. **Supabase**: create a free project at supabase.com.
   - SQL Editor → paste `supabase/schema.sql` → Run (creates tables, security, realtime, photo bucket, sample menu).
   - Then run each file in `supabase/migrations/` in order (e.g. `002_…sql`).
   - Authentication → Users → **Add user** (email + password) for your brother. Then Authentication → Providers → Email → turn **off** "Allow new users to sign up" so nobody else can create a staff login.
2. **Env**: copy `.env.example` to `.env.local` and fill in the 3 keys from Project Settings → API.
3. **Run**: `npm install` then `npm run dev` → http://localhost:3000 (staff: /admin).
4. **Deploy**: push to GitHub → import in Vercel → add the same 3 env vars → deploy. Share the link / print a QR code of it.

## Printer

Recommended: any **80mm ESC/POS thermal printer with USB or LAN** (Epson TM-T20III, Xprinter XP-80C, Rongta RP850). Install its Windows driver and set it as the **default printer** with paper size 80mm.

Silent auto-printing (no print dialog) uses Chrome's kiosk printing. On the kitchen PC, make a Chrome shortcut with:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing https://YOUR-SITE/admin
```

Close all Chrome windows first, then open via that shortcut. In `/admin`, tick **Auto-print new orders on this device** and click **Turn on new-order sound**. Use **Settings → Test print** to check the layout.

Only one device should have auto-print on; if two do, the order is still printed once (the first device claims it).

Printing options per device: kitchen ticket (big quantities, no prices), customer receipt (prices, address, VAT), or both on one job.

## Notes

- Prices are always recalculated on the server from the database, so customers can't tamper with totals.
- The service role key is used only in server code (`src/lib/supabase-server.ts`). Never put it in a `NEXT_PUBLIC_` variable.
- VAT: prices are treated as VAT-inclusive. Leave VAT at 0 unless the business is VAT-registered; with VAT > 0 and a TRN, the receipt prints as a tax invoice.
- Times are shown in Dubai time.

## Upgrading an existing install

When a new `supabase/migrations/NNN_*.sql` file appears, run it once in Supabase → SQL Editor **before** the new version goes live. Migrations only add things, so the running site keeps working while you do it.

## Delivery areas

Settings → Delivery areas: add each area with its fee and, optionally, its own minimum order. Customers pick their area at checkout. With no areas, the single delivery fee is used.

## Item options

Menu → edit a dish → Options. Use the quick buttons (Size, Spice level, Add-ons) or Custom. Each group can be required or optional and allow one or several choices, each with an extra price. Untick "On" to mark a single choice sold out. Options show on the kitchen ticket, receipt, order screen and customer's order page.

## WhatsApp updates

Each order card has a **WhatsApp** link that opens a ready-made message for the current status (free, uses the normal WhatsApp app — just tap send). Tick **Open WhatsApp message when I change status** on the Orders screen to have it pop up automatically after Accept, Mark ready, etc. Edit the wording in Settings → WhatsApp messages.

## Card payments

Card orders are only sent to the kitchen once paid; until then they're hidden. If a payment fails, the customer can retry or switch to cash from their order page.

1. Pick a provider and get an API key:
   - **Ziina** (UAE, quick for small businesses): Ziina app/dashboard → API key.
   - **Stripe**: Dashboard → Developers → API keys → Secret key.
2. In Vercel → Settings → Environment Variables add `PAYMENT_PROVIDER` (`ziina` or `stripe`) and the key (`ZIINA_API_KEY` or `STRIPE_SECRET_KEY`). For Ziina, keep `ZIINA_TEST_MODE=true` while testing. Redeploy.
3. `/admin/settings` → tick **Let customers pay by card**.
4. Recommended: add a webhook in the provider dashboard pointing to `https://YOUR-SITE/api/payments/webhook`, so payments are confirmed even if the customer closes the page. (The webhook content is never trusted; the app re-checks every payment with the provider.)

Refunds for rejected card orders are done in the provider's dashboard.

To add another gateway (Telr, Network International…), implement `PaymentProvider` in `src/lib/payments/providers.ts`.

## Ideas for later

Fully automatic WhatsApp messages (WhatsApp Cloud API), loyalty / repeat-customer discounts, scheduled orders, and an Android phone + Bluetooth printer setup via RawBT.
