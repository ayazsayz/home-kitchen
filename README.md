# Home Kitchen — online ordering + kitchen printing

Next.js 15 + Supabase. Customers order from their phone (cash on delivery or pickup); orders appear live on the kitchen dashboard, beep, and auto-print on an 80mm thermal printer.

## Pages

| URL | Who | What |
|---|---|---|
| `/` | Customers | Menu, search, cart, rating & reviews, English / العربية / اردو |
| `/checkout` | Customers | Delivery/pickup, ASAP or scheduled time, map pin, promo code, cash or card |
| `/order/<id>` | Customers | Live order status (auto-refreshes), rate the order when done |
| `/admin` | Owner, manager, cook | Live orders: accept → cooking → ready → delivered, reject, print, call/WhatsApp, assign driver |
| `/admin/driver` | Driver, owner, manager | Deliveries: pick up, map, call/WhatsApp, delivered, cash held by each driver & handovers |
| `/admin/staff` | Owner | Staff logins and roles |
| `/admin/menu` | Staff | Categories, dishes, photos, prices, cost & margin, translations, sold-out toggle, daily stock limits |
| `/admin/reviews` | Owner, manager | Ratings: average, publish to menu, follow up on low ratings |
| `/admin/customers` | Staff | Every customer by phone: orders, spend, favourites, history, WhatsApp message, CSV |
| `/admin/promos` | Staff | Promo codes: % off, AED off, free delivery, limits, dates, usage |
| `/admin/sales` | Staff | Daily summary (share on WhatsApp), revenue, best sellers, dish profit, by-day, CSV export |
| `/admin/expenses` | Staff | Record shopping & running costs, receipt photos, profit & cash-in-hand report, CSV |
| `/admin/settings` | Owner | Tabs: General (name, branding), Hours (incl. holidays), Delivery (fee, areas, map pin, delivery time), Payments & tax, Region & language, WhatsApp, Loyalty, Daily summary, Fake orders (limits, blocked numbers). One Save for all tabs; test print |

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
- Time zone, phone format and currency are set in Settings (defaults: UAE / Dubai / AED).

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

## Opening hours & scheduled orders

Settings → Opening hours & pre-orders:
- Tick the days you open and set times (in the shop's time zone). Use **split shift** for lunch + dinner, and **copy to all days** to save typing. A close time earlier than the open time means after midnight.
- **Open and close automatically**: the shop opens/closes itself by these hours. The big Open/Closed switch still overrides everything (use it for holidays).
- **Let customers schedule orders**: customers can pick a delivery/pickup time, even while you're closed (pre-orders). Settings: slot length, max orders per slot (stops the kitchen being overloaded), how far ahead the earliest slot is, and how many days ahead people can book.
- Scheduled orders arrive (and print) immediately with a big **FOR <day, time>** banner. Once accepted, orders due more than 90 minutes away move to the **Upcoming** tab and come back to Active when they're close.

## Promo codes

Admin → Promos → New code. Choose % off (with optional cap), AED off, or free delivery, plus optional minimum order, total uses, uses per customer (by mobile number), start/end dates and "new customers only". The list shows how many times each code was used and how much discount it gave. Click a status pill to switch a code on/off.

## Map pin

Customers can pin their location at checkout ("Use my current location" or drag the map). The driver gets an **Open in Google Maps** link on the order card, and the printed receipt has a **QR code** that opens the location in Google Maps.

- Works out of the box with OpenStreetMap (free, no key).
- To use Google Maps in the picker, create a Maps JavaScript API key in Google Cloud (restrict it to your site's domain) and add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in Vercel, then redeploy. Google requires a billing account but includes a monthly free allowance.
- Settings → Map pin: make the pin required for delivery, and set where the map starts (use the button on the kitchen's own phone/PC).

## Country, time zone & phone numbers

Settings → **Country & time zone**: picking a country (UAE, Pakistan, Saudi, Qatar, Oman, Kuwait, Bahrain, India, Bangladesh, Egypt, UK, US) fills in its time zone, phone code, currency and map start point — then press Save. Any of these can be changed individually; **Other…** lets you choose any time zone and phone code.

- **Time zone** drives opening hours, time slots, "today" in Sales/Expenses, promo start/end dates, order times on tickets, the order page and WhatsApp messages. Zones with daylight saving are handled.
- **Phone code** turns what customers type into a full WhatsApp number: in Pakistan `0300 1234567` → `+923001234567`; in the UAE `050 123 4567` → `+971501234567`. Numbers typed with `+` or `00` are kept as international.

## Currency

Settings → Currency: pick from the list (AED, SAR, PKR, INR, USD…) or **Other** and type a 3-letter code. You can change the symbol shown (e.g. "Rs", "KD") and the decimal places (0, 2 or 3). Changing currency does **not** convert prices — update menu prices, delivery fees and promo amounts yourself. Card payments are charged in this currency, so check your provider supports it (Ziina is mainly AED).

## Expenses & profit

Admin → **Expenses**: record what you spend — meat, chicken, buns, packaging, gas, rent… Tap a category, type the amount, optionally add what/where and a receipt photo (stored privately, only staff can open it). Date, category and payment method are kept for the next entry so a shopping trip can be entered quickly.

The top of the page shows, for the chosen period (today, 7 days, this month, last month or custom):
- **Sales** (all orders except rejected/unpaid), **Expenses**, **Profit** and margin.
- **Cash in hand** = cash sales − cash expenses — what should be in the cash box.

Below: spending by category (click one to filter), the full list (edit/delete), and CSV export for your accountant. Edit the category list with **Edit categories**.

## Customers

Admin → **Customers** lists everyone who has ordered, grouped by mobile number: orders, total spent, last order, favourite dish. Filter regulars (3+ orders), one-time customers or people who haven't ordered in 30 days; click a row for their order history. Write a message once (with `{name}` and `{menu}`) and tap **WhatsApp** next to each customer to send it, or **Copy numbers** to paste into a WhatsApp broadcast list. Export to CSV.

## Loyalty stamps

Settings → **Loyalty stamps**: e.g. every 10th order gets 20% off (or a fixed amount; optional cap and minimum order). Stamps are counted by mobile number from past orders — nothing for customers to sign up to. The reward is applied automatically at checkout; customers see their stamp card on the menu (on the device they ordered from), at checkout and on the order page. A reward order can't also use a promo code. Rewards show as "Loyalty reward" on tickets, the order screen and the customer list.

## Daily stock limits

Menu → edit a dish → **Daily limit**, e.g. 20 biryanis. The menu shows "Only 3 left today" when it's running low and "Sold out today" at zero; the server refuses orders beyond the limit. It resets every day (shop time zone). Pre-orders count towards the day they're scheduled for, rejected orders give the stock back, and unpaid card orders hold stock for 30 minutes. The admin menu shows "sold/limit today" per dish.

## Daily summary

- **Sales → Daily summary**: orders, sales, cash vs card, expenses, profit and top dishes for any day, with **Share on WhatsApp** (send it to yourself or a family group) and **Copy**.
- **Nightly email** (optional): create a free [Resend](https://resend.com) account, add `RESEND_API_KEY` and a random `CRON_SECRET` in Vercel → Environment Variables, enter the email in Settings → Daily summary email and redeploy. `vercel.json` runs the job at 20:30 UTC (00:30 UAE, 01:30 Pakistan) and emails the day that just ended. Use **Send today's summary now** to test. Without a verified domain, Resend only delivers to your own Resend login email; set `SUMMARY_FROM` once you verify a domain.

## Install as an app

The site is an installable web app:
- **Customers**: Android/Chrome shows an **Install** button on the menu; iPhone shows "Share → Add to Home Screen". It opens full-screen with the restaurant's initial as the icon.
- **Kitchen**: on the Orders screen, install the dashboard on the kitchen tablet/PC — it opens straight to `/admin`.
- If the connection drops, a friendly offline page is shown; menu, orders and prices are never cached, so everything stays live.

## Staff logins & roles

Admin → **Staff** (owner only): add each person with their own email + password and a role. Turn **Active** off to remove access instantly; **Reset password** sets a new one.

| Role | Can open |
|---|---|
| Owner | Everything, including Sales, Settings and Staff |
| Manager | Orders, Deliveries, Menu, Customers, Promos, Expenses |
| Cook | Orders only |
| Driver | Their deliveries only |

Rules are enforced twice: pages redirect to what the role may open, and the **database** itself (row-level security) refuses anything else, so a cook or driver can't read sales/expenses or change settings even with technical tricks. Migration 008 makes every existing login an **owner**, so nobody is locked out. There must always be at least one active owner.

## Deliveries (driver page)

Drivers sign in on their phone and land on **Deliveries**:
- **Ready to pick up**: delivery orders the kitchen marked Ready (unassigned, or assigned to them). Tap **Pick up** → it moves to **On the way** and the order shows "Out for delivery".
- **On the way**: address, area, notes, items, **Map** (customer's pin, or an address search), **Call**, **WhatsApp**, and the cash to collect (or PAID).
- **Delivered** completes the order. "Cash to hand over" is all the cash they've collected and not yet handed over (today's amount shown below it), plus a list of their handovers.

The owner can assign a driver from the order card on the Orders screen, and sees **Drivers today** (on the way, delivered, cash collected per driver) on the Deliveries page.

### Cash handover
**Cash with drivers** (owner/manager, on Deliveries) shows what each driver is holding: cash collected on delivered orders minus what they've handed over. When a driver gives you cash, tap **Received cash**, check the amount (pre-filled with their full balance; change it for a part payment), add a note if you like and save. Drivers can see their balance and handovers but can't record them. *First time after upgrading:* drivers' earlier deliveries count too, so record one handover per driver to start from zero.

## Branding

Settings → **Branding**: upload a logo (square) and a wide cover photo, pick a brand colour and write a tagline. They appear on the menu, the order buttons and links, the phone's address bar, the installed app icon (your logo) and the top of printed receipts. A live preview shows the result before you save.

## Order again

- The customer's order page has **Order this again**: it refills the cart with the same dishes and options at **today's** prices and opens checkout.
- Returning customers see **Your last order** at the top of the menu (remembered on their device) with an **Order again** button.
- Dishes that were removed, are sold out or whose options changed are left out, with a note first.

## Ratings & reviews

- When an order is **Done**, the customer's order page asks *How was your order?* (1–5 stars + optional comment). One review per order. The default thank-you WhatsApp message now includes the rating link (if you've customised that message, add `{link}` yourself).
- **3★ or less** shows as a red banner on the Orders screen until an owner/manager marks it seen, with a WhatsApp follow-up button on the **Reviews** page.
- **Reviews** page: average, star breakdown, filters, and **Show on menu**. The menu shows the overall average and the reviews you publish (first name only, never the phone number).
- The daily summary includes that day's rating.

## Dish profit

Menu → edit dish → **Cost to make** (ingredients + packaging for one portion). The menu list shows each dish's margin (red under 30%). Each order saves the cost at the time, so changing a cost later doesn't rewrite history; older orders use the current cost. **Sales → Dish profit** shows sold, sales, cost, profit and margin per dish for the chosen period. It's an estimate before discounts and delivery fees; real profit including rent, gas etc. is on **Expenses**. Option add-ons have no cost of their own.

## Arabic / Urdu

Settings → **Customer languages**: tick العربية and/or اردو and pick the default for new visitors. Customers then get a language switcher on the menu and order page; the menu, checkout, order tracking, stamp card and promo labels switch over, right-to-left, with an Urdu Nastaliq font. Add dish names/descriptions per language under Menu → edit dish, and category names via the category **Edit** button — anything left empty shows in English. Customers who ordered in Arabic or Urdu get the WhatsApp updates in their language (built-in wording; your custom English messages are used for English orders). Kitchen tickets, staff screens, option names and a few error messages stay in English.

## Menu look & badges

- **Picture cards:** dishes with a photo or description show as big cards (2 per row on phones). Add photos under Menu → edit dish → Photo; until then a food emoji tile is shown. Plain extras (no photo, no description, e.g. add-ons) stay in a compact list.
- **Header:** cover photo and logo (Settings → General), plus "Open now", rating, delivery time, delivery fee and minimum order. Set the delivery time in Settings → Delivery → *Usual delivery time* (leave empty to hide).
- **Badges:** 🔥 Bestseller is automatic (top 3 dishes sold 3+ times in the last 30 days). Tick 🌶️ Spicy, ⭐ Chef's pick or 🆕 New when editing a dish.
- **Dish sheet:** tapping a dish opens a big picture with the full description.
- **"Goes well with your order"** at checkout: dishes you tick ✨ *Suggest at checkout* (e.g. fries, sauce, drinks), or otherwise cheaper extras from other categories. Only dishes without options, added in one tap.

**Photo tips:** daylight near a window, 45° angle, same plain background, square crop, under ~1 MB.

## Photos

Photos are shrunk on the phone/computer before upload (dish photos to 1200 px, cover 1800 px, logo 512 px, receipts 1600 px), so a 5 MB phone photo becomes about 150–300 KB and the menu loads fast. No need to resize anything yourself.

## Link preview (WhatsApp, Instagram, Facebook)

Sharing the shop link shows a card with your logo, name, tagline and cover photo (from Settings → General), plus "Order now". It updates when you change those settings. WhatsApp caches previews for a while, so a change may take time to show on links already sent.

## Fake-order protection

Settings → **Fake orders**:
- **Order limits:** at most N orders per phone number and per phone/computer in 10 minutes (defaults 3 and 6; 0 = off). Extra orders are asked to wait or call.
- **Blocked numbers:** these can't order online and are asked to call you. Add or unblock them here, or tap **🚫 Block** on a new/rejected order on the Orders screen (owner/manager).
- The Orders screen marks **🆕 First order — call to confirm** for a number's first ever order.
- Devices are recognised by an anonymous code; IP addresses are never stored.

## Holidays & days off

Settings → Hours → **Holidays & days off**: add dates (e.g. Eid, with an optional reason shown to customers). On those days the menu shows "Closed for Eid. Back Mon 2 Nov." and no orders are taken for them. If pre-orders are on, customers can still book for after the holiday.

## Edit or cancel an order

On the Orders screen (owner, manager, cook):
- **✏️ Edit** (new → ready, cash orders): change quantities, remove dishes or add dishes (with options). Dishes already on the order keep the price the customer saw; the total, promo/loyalty discount and delivery fee are recalculated. The card shows "✏️ Updated", the customer's order page shows the change, and printed tickets say "UPDATED ORDER". A button opens WhatsApp with the new total for the customer.
- **Cancel order** (accepted → on the way): asks for a reason. The order moves to Rejected marked "Cancelled by … : reason" and is left out of sales, profit, stock and loyalty. The customer's page says it was cancelled.
- Card-paid orders can't be edited: cancel (and refund in your payment dashboard) and place a new one.

## Backups

Settings → **Summary & backup** → **Backup**: download a ZIP of everything (orders, dishes, customers' notes, expenses, reviews, settings…) as CSV files that open in Excel, or email it now. With "Email me a backup every Sunday" on, the nightly summary job also emails the ZIP on Sundays (needs the daily summary email set up). Save the files somewhere safe, e.g. Google Drive.

## Privacy & terms

`/legal` is a plain-language privacy policy and ordering terms, filled in from your shop details (name, phone, address, VAT, payment methods). It's linked in the menu footer and at checkout. Add your own extra rules in Settings → General → *Extra terms*. It's a sensible starting point, not legal advice.

## Late-order alert

Settings → Hours → **Late-order alert** (default 30 min, 0 = off). An order that isn't ready that long after it was placed — or a pre-order past its time — turns red on the Orders screen with "⏰ Late by N min" and beeps once (when the sound is on).

## WhatsApp button & customer notes

- A green 💬 button on the menu opens a WhatsApp chat with the shop phone (Settings → General; can be turned off).
- **📌 Customer notes** ("allergic to nuts", "VIP"): add from the 📌 button on an order card or on the Customers page. The note shows on every order from that number and prints on the kitchen ticket.

## WhatsApp orders

**Send WhatsApp chats to the website.** Settings → WhatsApp → *Get WhatsApp chats ordering on the website* has ready-made **greeting**, **away** and **/menu quick reply** messages with your menu link (tap Copy, paste into WhatsApp Business → Business tools), and a **menu QR code** to download for flyers, food bags and your WhatsApp status.

**Orders typed in WhatsApp, phoned in or at the door.** Orders screen → **+ New order** (owner, manager, cook):
- pick 💬 WhatsApp / 📞 Phone / 🚶 Walk-in, type the mobile number — a returning customer's name, address and area fill in, with their 📌 note and a warning if the number is blocked;
- tap dishes (options supported), add notes or a promo code, **Place order**;
- then **Send confirmation & tracking link** opens WhatsApp with the order number, total and tracking page.

Staff orders skip the website-only checks (opening hours, minimum order, map pin, order limits, blocked numbers) but use the same prices, delivery fees, stock limits, loyalty and promo rules. They show on the Orders screen as "💬 WhatsApp order · by <name>", print, go to drivers, and count in Sales (split by channel), Customers and the CSV export.

**WhatsApp ordering bot (not built).** Taking orders automatically inside WhatsApp needs Meta's WhatsApp Cloud API (business verification, usually moving the number off the WhatsApp Business app) and is charged per message. Worth it only if WhatsApp orders become a large share.

## Ideas for later

Fully automatic WhatsApp messages (WhatsApp Cloud API), combo deals, ingredient stock, recurring expenses, and an Android phone + Bluetooth printer setup via RawBT.
