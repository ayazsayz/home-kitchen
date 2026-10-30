"use client";
import { IMAGE_SIZES, shrinkImage } from "@/lib/image";
import { LANGS } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { CURRENCIES, currencyOf, money, normalise } from "@/lib/format";
import { printOrder } from "@/lib/ticket";
import { DEFAULT_TEMPLATES, NOTIFY_STATUSES, PLACEHOLDERS } from "@/lib/whatsapp";
import { STATUS_LABEL, type Order, type OrderStatus, type Settings } from "@/lib/types";
import { withSettingDefaults } from "@/lib/settings";
import HoursSettings from "./HoursSettings";
import ClosuresSettings from "./ClosuresSettings";
import BlockedNumbers from "./BlockedNumbers";
import WhatsAppSetup from "./WhatsAppSetup";
import { REGIONS, regionOf } from "@/lib/region";
import { tzLabel, validTz } from "@/lib/tz";
import { BRAND_PRESETS, DEFAULT_BRAND, brandStyle, isTooLight, normalizeHex } from "@/lib/brand";

const TABS = [
  { key: "general", icon: "🏠", label: "General", hint: "Name, contact details, logo and colours." },
  { key: "hours", icon: "🕒", label: "Hours", hint: "When you're open, pre-order time slots, holidays and days off." },
  { key: "delivery", icon: "🛵", label: "Delivery", hint: "Delivery fee, minimum order, areas and the map pin." },
  { key: "payments", icon: "💳", label: "Payments & tax", hint: "Card payments, VAT and TRN." },
  { key: "region", icon: "🌐", label: "Region & language", hint: "Country, time zone, currency and customer languages." },
  { key: "messages", icon: "💬", label: "WhatsApp", hint: "Messages sent to customers when an order changes." },
  { key: "loyalty", icon: "⭐", label: "Loyalty", hint: "Stamp card rewards for regular customers." },
  { key: "reports", icon: "📋", label: "Summary & backup", hint: "Nightly email with the day's numbers, and backups of all your data." },
  { key: "safety", icon: "🛡️", label: "Fake orders", hint: "Blocked numbers and limits on repeated orders." },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const isTab = (x: string): x is TabKey => TABS.some((t) => t.key === x);

export default function SettingsForm({ paymentProvider, zones }: { paymentProvider: string | null; zones?: React.ReactNode }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<TabKey>("general");

  useEffect(() => {
    db.from("settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const v = withSettingDefaults(normalise(data));
        setS(v);
        setSavedJson(JSON.stringify(v));
      });
  }, [db]);

  // Open the tab named in the address, e.g. /admin/settings#delivery
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (isTab(h)) setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const dirty = !!s && !!savedJson && JSON.stringify(s) !== savedJson;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault(); // "Leave site? Changes may not be saved."
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Keep the chosen tab visible in the scrolling tab row on phones.
  useEffect(() => {
    document.querySelector(`[data-tab="${tab}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab, s]);

  if (!s) return <p className="text-muted">Loading…</p>;
  const current = TABS.find((t) => t.key === tab)!;
  const pickTab = (k: TabKey) => {
    setTab(k);
    history.replaceState(null, "", `#${k}`);
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    const code = (s.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      setMsg("Currency code must be 3 letters, e.g. AED");
      return;
    }
    const { error } = await db
      .from("settings")
      .update({
        name: s.name,
        currency: code,
        currency_symbol: (s.currency_symbol || "").trim().slice(0, 8),
        currency_decimals: [0, 2, 3].includes(Number(s.currency_decimals)) ? Number(s.currency_decimals) : 2,
        logo_url: s.logo_url,
        cover_url: s.cover_url,
        brand_color: normalizeHex(s.brand_color) ?? DEFAULT_BRAND,
        tagline: (s.tagline || "").trim().slice(0, 80),
        country: s.country,
        timezone: validTz(s.timezone),
        phone_country_code: (s.phone_country_code || "").replace(/\D/g, "") || "971",
        languages: ["en", ...s.languages.filter((l) => l === "ar" || l === "ur")],
        default_language: ["en", ...s.languages].includes(s.default_language) ? s.default_language : "en",
        loyalty_enabled: s.loyalty_enabled,
        loyalty_every: Math.min(100, Math.max(2, Math.round(Number(s.loyalty_every)) || 10)),
        loyalty_kind: s.loyalty_kind,
        loyalty_value: Math.max(0, Number(s.loyalty_value) || 0),
        loyalty_max: s.loyalty_max === null || (s.loyalty_max as unknown) === "" ? null : Number(s.loyalty_max),
        loyalty_min_order: Math.max(0, Number(s.loyalty_min_order) || 0),
        summary_email: (s.summary_email || "").trim(),
        phone: s.phone,
        address: s.address,
        delivery_fee: Number(s.delivery_fee) || 0,
        min_order: Number(s.min_order) || 0,
        late_minutes: Math.min(240, Math.max(0, Math.round(Number(s.late_minutes)) || 0)),
        backup_weekly: s.backup_weekly,
        whatsapp_button: s.whatsapp_button,
        legal_extra: (s.legal_extra || "").slice(0, 2000),
        max_orders_phone: Math.min(50, Math.max(0, Math.round(Number(s.max_orders_phone)) || 0)),
        max_orders_device: Math.min(50, Math.max(0, Math.round(Number(s.max_orders_device)) || 0)),
        closures: s.closures
          .filter((c) => c.from && c.to)
          .map((c) => (c.to < c.from ? { ...c, from: c.to, to: c.from } : c))
          .map((c) => ({ ...c, note: c.note.trim().slice(0, 40) }))
          .sort((a, b) => a.from.localeCompare(b.from)),
        eta_minutes:
          s.eta_minutes === null || (s.eta_minutes as unknown) === "" ? null : Math.min(240, Math.max(5, Math.round(Number(s.eta_minutes)) || 30)),
        vat_percent: Number(s.vat_percent) || 0,
        trn: s.trn,
        is_open: s.is_open,
        closed_message: s.closed_message,
        whatsapp_templates: s.whatsapp_templates,
        card_enabled: s.card_enabled,
        hours: s.hours,
        auto_hours: s.auto_hours,
        allow_asap: s.allow_asap,
        allow_scheduled: s.allow_scheduled,
        slot_minutes: Math.max(10, Math.round(s.slot_minutes) || 30),
        slot_capacity: Math.max(0, Math.round(s.slot_capacity) || 0),
        lead_minutes: Math.max(0, Math.round(s.lead_minutes) || 0),
        days_ahead: Math.min(14, Math.max(0, Math.round(s.days_ahead) || 0)),
        require_pin: s.require_pin,
        map_center_lat: Number(s.map_center_lat) || 25.2048,
        map_center_lng: Number(s.map_center_lng) || 55.2708,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setMsg(error ? error.message : "Saved");
    if (!error) setSavedJson(JSON.stringify(s));
    setTimeout(() => setMsg(""), 2500);
  }

  function testPrint() {
    if (!s) return;
    const sample: Order = {
      id: "test",
      order_no: 0,
      status: "new",
      order_type: "delivery",
      customer_name: "Test Customer",
      customer_phone: `+${s.phone_country_code}500000000`,
      address: "Test address",
      notes: "Test print",
      subtotal: 32,
      delivery_fee: Number(s.delivery_fee) || 0,
      total: 32 + (Number(s.delivery_fee) || 0),
      vat_percent: Number(s.vat_percent) || 0,
      payment_method: "cod",
      payment_status: "unpaid",
      zone_name: "Al Nahda",
      printed_at: null,
      created_at: new Date().toISOString(),
      scheduled_for: new Date(Date.now() + 3 * 3600e3).toISOString(),
      promo_code: "WELCOME10",
      discount: 3.2,
      location_lat: Number(s.map_center_lat) || 25.2048,
      location_lng: Number(s.map_center_lng) || 55.2708,
      order_items: [
        {
          id: "a",
          order_id: "test",
          menu_item_id: null,
          name: "Chicken Biryani",
          unit_price: 28,
          qty: 1,
          line_total: 28,
          options: [{ group: "Spice level", name: "Medium", price: 0 }],
        },
        { id: "b", order_id: "test", menu_item_id: null, name: "Garlic Naan", unit_price: 4, qty: 1, line_total: 4, options: [] },
      ],
    };
    printOrder(sample, s, "both");
  }

  const panels: Record<TabKey, React.ReactNode> = {
    general: (
      <>
        <div className="card space-y-3 p-4">
          <div className="font-semibold">Restaurant details</div>
          <Field label="Restaurant name">
            <input className="input" value={s.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Phone (shown to customers)">
            <input className="input" value={s.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Address (printed on receipt)">
            <input className="input" value={s.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Message when closed">
            <input className="input" value={s.closed_message} onChange={(e) => set("closed_message", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-ok" checked={s.whatsapp_button} aria-label="WhatsApp chat button"
              onChange={(e) => set("whatsapp_button", e.target.checked)} />
            Show a 💬 WhatsApp chat button on the menu (uses the phone above)
          </label>
        </div>
        <BrandingSettings s={s} set={set} />
        <div className="card space-y-3 p-4">
          <div>
            <div className="font-semibold">📄 Privacy & terms</div>
            <p className="text-sm text-muted">
              A ready-made <a href="/legal" target="_blank" className="text-brand underline">Privacy & Terms page</a> is linked at the bottom of the menu
              and checkout, filled in with your shop details. Add anything extra below (e.g. refund rules, allergy notice).
            </p>
          </div>
          <Field label="Extra terms (optional)">
            <textarea id="legal-extra" className="input text-sm" rows={3} maxLength={2000} value={s.legal_extra}
              onChange={(e) => set("legal_extra", e.target.value)} />
          </Field>
        </div>
      </>
    ),
    hours: (
      <>
        <HoursSettings s={s} set={set} />
        <ClosuresSettings s={s} set={set} />
        <div className="card space-y-2 p-4">
          <div className="font-semibold">⏰ Late-order alert</div>
          <p className="text-sm text-muted">
            On the Orders screen, an order not yet ready this many minutes after it was placed (or past its pre-order time) turns red and beeps once.
            0 = off.
          </p>
          <Field label="Minutes">
            <input id="late-minutes" className="input w-32" type="number" min={0} max={240} value={s.late_minutes}
              onChange={(e) => set("late_minutes", e.target.value as unknown as number)} />
          </Field>
        </div>
      </>
    ),
    delivery: (
      <>
        <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Delivery fee (if no areas)">
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={s.delivery_fee}
              onChange={(e) => set("delivery_fee", e.target.value as unknown as number)}
            />
          </Field>
          <Field label="Minimum order">
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={s.min_order}
              onChange={(e) => set("min_order", e.target.value as unknown as number)}
            />
          </Field>
          <Field label="Usual delivery time, minutes (shown on the menu)">
            <input
              id="eta-minutes"
              className="input"
              type="number"
              min={5}
              max={240}
              step={5}
              placeholder="e.g. 40 — leave empty to hide"
              value={s.eta_minutes ?? ""}
              onChange={(e) => set("eta_minutes", e.target.value === "" ? null : (e.target.value as unknown as number))}
            />
          </Field>
        </div>
        {zones}
        <div className="card space-y-3 p-4">
          <div className="font-semibold">Map pin at checkout</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-ok"
              checked={s.require_pin}
              onChange={(e) => set("require_pin", e.target.checked)}
            />
            Require customers to pin their location for delivery (otherwise optional)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Map starts at (latitude)">
              <input
                className="input"
                type="number"
                step="any"
                value={s.map_center_lat}
                onChange={(e) => set("map_center_lat", e.target.value as unknown as number)}
              />
            </Field>
            <Field label="Longitude">
              <input
                className="input"
                type="number"
                step="any"
                value={s.map_center_lng}
                onChange={(e) => set("map_center_lng", e.target.value as unknown as number)}
              />
            </Field>
          </div>
          <button
            type="button"
            className="text-sm text-brand"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition((p) =>
                setS(
                  (cur) => cur && { ...cur, map_center_lat: +p.coords.latitude.toFixed(5), map_center_lng: +p.coords.longitude.toFixed(5) },
                ),
              )
            }
          >
            🎯 Use this device&apos;s location as the map start point
          </button>
        </div>
      </>
    ),
    payments: (
      <>
        <div className="card space-y-3 p-4">
          <div>
            <div className="font-semibold">Card payments</div>
            {paymentProvider ? (
              <p className="text-sm text-muted">
                Connected to <b className="capitalize">{paymentProvider}</b>.
              </p>
            ) : (
              <p className="text-sm text-muted">Not set up yet. Add the payment provider keys in Vercel (see README), then turn this on.</p>
            )}
          </div>
          <label className={`flex items-center gap-2 ${paymentProvider ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-ok"
              disabled={!paymentProvider}
              checked={s.card_enabled}
              onChange={(e) => set("card_enabled", e.target.checked)}
            />
            Let customers pay by card at checkout
          </label>
        </div>
        <div className="card space-y-3 p-4">
          <div className="font-semibold">Tax</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="VAT % (0 if not registered)">
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={s.vat_percent}
                onChange={(e) => set("vat_percent", e.target.value as unknown as number)}
              />
            </Field>
            <Field label="TRN">
              <input className="input" value={s.trn} onChange={(e) => set("trn", e.target.value)} />
            </Field>
          </div>
        </div>
      </>
    ),
    region: (
      <>
        <RegionSettings s={s} setS={setS} />
        <CurrencySettings s={s} setS={setS} />
        <LanguageSettings s={s} setS={setS} />
      </>
    ),
    messages: (
      <>
        <WhatsAppSetup s={s} />
      <div className="card p-4">
        <div className="font-semibold">WhatsApp messages</div>
        <p className="mt-2 text-sm text-muted">
          Sent with one tap from the Orders screen. Leave a box empty to use the default. You can use{" "}
          {PLACEHOLDERS.map((p) => (
            <code key={p} className="mr-1 rounded bg-cream px-1">
              {p}
            </code>
          ))}
        </p>
        <div className="mt-3 space-y-3">
          {(["new", ...NOTIFY_STATUSES] as OrderStatus[]).map((st) => (
            <Field key={st} label={STATUS_LABEL[st]}>
              <textarea
                className="input text-sm"
                rows={2}
                placeholder={DEFAULT_TEMPLATES[st as keyof typeof DEFAULT_TEMPLATES]}
                value={s.whatsapp_templates[st] ?? ""}
                onChange={(e) => set("whatsapp_templates", { ...s.whatsapp_templates, [st]: e.target.value })}
              />
            </Field>
          ))}
        </div>
      </div>
      </>
    ),
    loyalty: <LoyaltySettings s={s} set={set} />,
    reports: <SummarySettings s={s} set={set} />,
    safety: (
      <>
        <div className="card space-y-3 p-4">
          <div>
            <div className="font-semibold">⏱ Order limits</div>
            <p className="text-sm text-muted">
              Stops someone placing a pile of prank orders. Counted over 10 minutes; 0 = no limit. First orders from a new number are marked 🆕 on the
              Orders screen so you can call to confirm.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Max orders per phone number">
              <input id="max-orders-phone" className="input" type="number" min={0} max={50} value={s.max_orders_phone}
                onChange={(e) => set("max_orders_phone", e.target.value as unknown as number)} />
            </Field>
            <Field label="Max orders per phone/computer">
              <input id="max-orders-device" className="input" type="number" min={0} max={50} value={s.max_orders_device}
                onChange={(e) => set("max_orders_device", e.target.value as unknown as number)} />
            </Field>
          </div>
        </div>
        <BlockedNumbers countryCode={s.phone_country_code} tz={s.timezone} />
      </>
    ),
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <label className={`card flex items-center justify-between p-4 ${s.is_open ? "border-ok" : "border-brand"}`}>
        <div>
          <div className="font-semibold">{s.is_open ? "Open for orders" : "Closed"}</div>
          <div className="text-sm text-muted">Turn off when you stop taking orders for the day.</div>
        </div>
        <input type="checkbox" className="h-6 w-6 accent-ok" checked={s.is_open} onChange={(e) => set("is_open", e.target.checked)} />
      </label>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
          role="tablist"
          aria-label="Settings sections"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              data-tab={t.key}
              onClick={() => pickTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium ${
                tab === t.key ? "bg-ink text-white" : "border border-line bg-paper hover:bg-cream lg:border-transparent lg:bg-transparent"
              }`}
            >
              <span aria-hidden>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{current.label}</h2>
            <p className="text-sm text-muted">{current.hint}</p>
          </div>
          {/* All sections stay mounted so one Save keeps every change. */}
          {TABS.map((t) => (
            <div key={t.key} role="tabpanel" hidden={tab !== t.key} className="space-y-4" data-panel={t.key}>
              {panels[t.key]}
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-line bg-cream/95 px-1 py-3 backdrop-blur">
        <button className="btn">Save</button>
        <button type="button" className="btn-ghost" onClick={testPrint}>
          🖨 Test print
        </button>
        {dirty && !msg && (
          <span className="text-sm text-brand-dark" data-testid="unsaved">
            ● Unsaved changes
          </span>
        )}
        {msg && <span className={`text-sm ${msg === "Saved" ? "text-ok" : "text-red-700"}`}>{msg}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function CurrencySettings({ s, setS }: { s: Settings; setS: (fn: (cur: Settings | null) => Settings | null) => void }) {
  const isKnown = CURRENCIES.some((c) => c.code === s.currency);
  const [other, setOther] = useState(!isKnown);
  const patch = (p: Partial<Settings>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const preview = currencyOf(s);
  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="font-semibold">Currency</div>
        <p className="text-sm text-muted">
          Changing it does not convert your prices — update menu prices, fees and promo amounts yourself.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="label" htmlFor="currency">
            Currency
          </label>
          <select
            id="currency"
            className="input"
            value={other ? "__other" : s.currency}
            onChange={(e) => {
              if (e.target.value === "__other") return setOther(true);
              const c = CURRENCIES.find((x) => x.code === e.target.value)!;
              setOther(false);
              patch({ currency: c.code, currency_symbol: "", currency_decimals: c.decimals });
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
            <option value="__other">Other…</option>
          </select>
        </div>
        {other && (
          <div>
            <label className="label" htmlFor="currency-code">
              Code
            </label>
            <input
              id="currency-code"
              className="input uppercase"
              maxLength={3}
              placeholder="e.g. NPR"
              value={s.currency}
              onChange={(e) => patch({ currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="currency-symbol">
            Symbol shown
          </label>
          <input
            id="currency-symbol"
            className="input"
            maxLength={8}
            placeholder={currencyOf({ currency: s.currency }).symbol}
            value={s.currency_symbol}
            onChange={(e) => patch({ currency_symbol: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="currency-decimals">
            Decimals
          </label>
          <select
            id="currency-decimals"
            className="input"
            value={s.currency_decimals}
            onChange={(e) => patch({ currency_decimals: Number(e.target.value) })}
          >
            <option value={0}>0 (1,250)</option>
            <option value={2}>2 (1,250.00)</option>
            <option value={3}>3 (1,250.000)</option>
          </select>
        </div>
      </div>
      <p className="text-sm">
        Preview: <b data-testid="currency-preview">{money(1250.5, preview)}</b>
      </p>
    </div>
  );
}

/** All IANA time zones the browser knows (falls back to the preset list). */
function allTimeZones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list;
  } catch {}
  return [...new Set(REGIONS.map((r) => r.timezone))];
}

function RegionSettings({ s, setS }: { s: Settings; setS: (fn: (cur: Settings | null) => Settings | null) => void }) {
  const [note, setNote] = useState("");
  const zones = useMemo(() => {
    const z = allTimeZones();
    return z.includes(s.timezone) ? z : [s.timezone, ...z];
  }, [s.timezone]);
  const patch = (p: Partial<Settings>) => setS((cur) => (cur ? { ...cur, ...p } : cur));

  function pickCountry(code: string) {
    const r = regionOf(code);
    if (!r) return patch({ country: code });
    const changes = [`time zone ${tzLabel(r.timezone)}`, `phone code +${r.phoneCode}`, "map start point"];
    const p: Partial<Settings> = {
      country: r.country,
      timezone: r.timezone,
      phone_country_code: r.phoneCode,
      map_center_lat: r.lat,
      map_center_lng: r.lng,
    };
    if (r.currency !== s.currency) {
      const c = CURRENCIES.find((x) => x.code === r.currency);
      Object.assign(p, { currency: r.currency, currency_symbol: "", currency_decimals: c?.decimals ?? 2 });
      changes.push(`currency ${r.currency} (prices are not converted)`);
    }
    patch(p);
    setNote(`Set ${changes.join(", ")}. Press Save to apply.`);
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="font-semibold">Country & time zone</div>
        <p className="text-sm text-muted">
          Used for opening hours, order times, reports and turning local mobile numbers into WhatsApp numbers.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="country">
          Country
        </label>
        <select
          id="country"
          className="input"
          value={regionOf(s.country) ? s.country : "__other"}
          onChange={(e) => pickCountry(e.target.value)}
        >
          {REGIONS.map((r) => (
            <option key={r.country} value={r.country}>
              {r.name}
            </option>
          ))}
          <option value="__other">Other…</option>
        </select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div>
          <label className="label" htmlFor="timezone">
            Time zone
          </label>
          <select id="timezone" className="input" value={s.timezone} onChange={(e) => patch({ timezone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="phone-code">
            Phone code
          </label>
          <div className="flex items-center gap-1">
            <span className="text-muted">+</span>
            <input
              id="phone-code"
              className="input"
              inputMode="numeric"
              maxLength={4}
              value={s.phone_country_code}
              onChange={(e) => patch({ phone_country_code: e.target.value.replace(/\D/g, "") })}
            />
          </div>
        </div>
      </div>
      <p className="text-sm text-muted" data-testid="region-preview">
        Local time now:{" "}
        <b>{new Date().toLocaleString("en-GB", { timeZone: validTz(s.timezone), weekday: "short", hour: "2-digit", minute: "2-digit" })}</b>
        {" · "}customers can type <b>{regionOf(s.country)?.mobileExample ?? "their local number"}</b>
      </p>
      {note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{note}</p>}
    </div>
  );
}

function LoyaltySettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const cur = currencyOf(s);
  const n = Math.max(2, Number(s.loyalty_every) || 10);
  return (
    <div className="card space-y-3 p-4">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="font-semibold">⭐ Loyalty stamps</span>
          <span className="block text-sm text-muted">
            Customers collect a stamp per order (by mobile number). The reward is applied automatically at checkout.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-ok"
          checked={s.loyalty_enabled}
          onChange={(e) => set("loyalty_enabled", e.target.checked)}
          aria-label="Loyalty on"
        />
      </label>
      {s.loyalty_enabled && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Every Nth order">
              <input
                id="loyalty-every"
                className="input"
                type="number"
                min={2}
                max={100}
                value={s.loyalty_every}
                onChange={(e) => set("loyalty_every", e.target.value as unknown as number)}
              />
            </Field>
            <Field label="Reward">
              <select
                className="input"
                value={s.loyalty_kind}
                onChange={(e) => set("loyalty_kind", e.target.value as Settings["loyalty_kind"])}
              >
                <option value="percent">% off</option>
                <option value="fixed">{cur.code} off</option>
              </select>
            </Field>
            <Field label={s.loyalty_kind === "percent" ? "Percent" : `Amount (${cur.code})`}>
              <input
                id="loyalty-value"
                className="input"
                type="number"
                min={0}
                step="any"
                value={s.loyalty_value}
                onChange={(e) => set("loyalty_value", e.target.value as unknown as number)}
              />
            </Field>
            {s.loyalty_kind === "percent" ? (
              <Field label={`Max (${cur.code})`}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  placeholder="No cap"
                  value={s.loyalty_max ?? ""}
                  onChange={(e) => set("loyalty_max", e.target.value === "" ? null : (e.target.value as unknown as number))}
                />
              </Field>
            ) : (
              <div />
            )}
          </div>
          <Field label={`Orders below this don't earn a stamp (${cur.code}, optional)`}>
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              value={s.loyalty_min_order || ""}
              placeholder="0"
              onChange={(e) => set("loyalty_min_order", (e.target.value || 0) as unknown as number)}
            />
          </Field>
          <p className="rounded-lg bg-cream px-3 py-2 text-sm">
            Order {n} gets{" "}
            <b>{s.loyalty_kind === "percent" ? `${Number(s.loyalty_value)}% off` : `${money(Number(s.loyalty_value) || 0, cur)} off`}</b>,
            then orders {n + 1}…{2 * n - 1} earn stamps again and order {2 * n} gets the reward, and so on. A reward order can&apos;t also
            use a promo code.
          </p>
        </>
      )}
    </div>
  );
}

function LanguageSettings({ s, setS }: { s: Settings; setS: (fn: (cur: Settings | null) => Settings | null) => void }) {
  const patch = (p: Partial<Settings>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const on = (l: Lang) => l === "en" || s.languages.includes(l);
  const toggle = (l: Lang, v: boolean) => {
    const languages = v ? [...new Set([...s.languages, l])] : s.languages.filter((x) => x !== l);
    patch({ languages, default_language: !v && s.default_language === l ? "en" : s.default_language });
  };
  return (
    <div className="card space-y-3 p-4" data-testid="language-settings">
      <div>
        <div className="font-semibold">🌐 Customer languages</div>
        <p className="text-sm text-muted">
          Customers can switch the menu, checkout and order page to these languages. Add dish names in each language under Menu → edit dish
          (English is shown where you leave it empty). Kitchen tickets and staff screens stay in English.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {LANGS.map((l) => (
          <label key={l.lang} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={on(l.lang)}
              disabled={l.lang === "en"}
              onChange={(e) => toggle(l.lang, e.target.checked)}
              aria-label={`Offer ${l.label}`}
            />
            {l.label}
          </label>
        ))}
      </div>
      <Field label="Default for new visitors">
        <select
          id="default-language"
          className="input"
          value={s.default_language}
          onChange={(e) => patch({ default_language: e.target.value as Lang })}
        >
          {LANGS.filter((l) => on(l.lang)).map((l) => (
            <option key={l.lang} value={l.lang}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function SummarySettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const [msg, setMsg] = useState("");
  async function sendTest() {
    setMsg("Sending…");
    const res = await fetch("/api/admin/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await res.json().catch(() => ({}));
    setMsg(d.sent ? "Sent ✓ — check your inbox" : `Not sent: ${d.reason ?? d.error ?? "unknown error"}`);
  }
  return (
    <div className="card space-y-3 p-4">
      <div>
        <div className="font-semibold">📋 Daily summary email</div>
        <p className="text-sm text-muted">
          Every night after closing, get orders, sales, cash vs card, expenses, profit and top dishes by email. You can also share any
          day&apos;s summary on WhatsApp from the Sales page.
        </p>
      </div>
      <Field label="Send to (email, comma-separate for several)">
        <input
          id="summary-email"
          className="input"
          type="text"
          inputMode="email"
          placeholder="owner@example.com"
          value={s.summary_email}
          onChange={(e) => set("summary_email", e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btn-ghost py-1.5 text-sm" onClick={sendTest} disabled={!s.summary_email.trim()}>
          Send today&apos;s summary now
        </button>
        {msg && <span className={msg.startsWith("Sent") ? "text-ok" : "text-muted"}>{msg}</span>}
      </div>
      <p className="text-xs text-muted">
        Needs a free Resend account: add <code>RESEND_API_KEY</code> and <code>CRON_SECRET</code> in Vercel (see README). Save first, then
        test.
      </p>
      <BackupSettings s={s} set={set} />
    </div>
  );
}

function BackupSettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const [msg, setMsg] = useState("");
  async function sendNow() {
    setMsg("Sending…");
    const res = await fetch("/api/admin/backup", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setMsg(d.sent ? "Sent ✓ — check your inbox" : `Not sent: ${d.reason ?? d.error ?? "unknown error"}`);
  }
  return (
    <div className="space-y-2 border-t border-line pt-3" data-testid="backup-settings">
      <div className="font-semibold">💾 Backup</div>
      <p className="text-sm text-muted">
        A ZIP of all your orders, customers, menu, expenses and settings (CSV files that open in Excel). The free database plan has no backups, so keep a copy.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-ok" checked={s.backup_weekly} aria-label="Weekly backup email"
          onChange={(e) => set("backup_weekly", e.target.checked)} />
        Email me a backup every Sunday night (to the address above)
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <a className="btn-ghost py-1.5 text-sm" href="/api/admin/backup" data-testid="download-backup">⬇ Download backup now</a>
        <button type="button" className="btn-ghost py-1.5 text-sm" onClick={sendNow} disabled={!s.summary_email.trim()}>Email backup now</button>
        {msg && <span className={msg.startsWith("Sent") ? "text-ok" : "text-muted"}>{msg}</span>}
      </div>
    </div>
  );
}

function BrandingSettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [busy, setBusy] = useState<"" | "logo" | "cover">("");
  const [err, setErr] = useState("");
  const color = normalizeHex(s.brand_color) ?? DEFAULT_BRAND;

  async function upload(kind: "logo" | "cover", original: File) {
    setBusy(kind);
    setErr("");
    const file = await shrinkImage(original, kind === "logo" ? IMAGE_SIZES.logo : IMAGE_SIZES.cover, { keepAlpha: kind === "logo" });
    if (file.size > 5 * 1024 * 1024) {
      setBusy("");
      return setErr("Please use an image under 5 MB");
    }
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `branding/${kind}-${Date.now()}.${ext}`;
    const { error } = await db.storage.from("menu").upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    setBusy("");
    if (error) return setErr(error.message);
    set(kind === "logo" ? "logo_url" : "cover_url", db.storage.from("menu").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="card space-y-4 p-4">
      <div>
        <div className="font-semibold">Branding</div>
        <p className="text-sm text-muted">Your logo, cover photo and colour on the menu, the app icon and printed receipts.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Logo (square works best)</span>
          <div className="flex items-center gap-3">
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo_url} alt="Logo" className="h-16 w-16 rounded-xl border border-line bg-paper object-contain" />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-xl text-2xl font-bold text-white" style={{ background: color }}>
                {(s.name.trim()[0] || "K").toUpperCase()}
              </div>
            )}
            <div className="space-y-1 text-sm">
              <input
                type="file"
                accept="image/*"
                aria-label="Upload logo"
                className="block w-full text-xs"
                onChange={(e) => e.target.files?.[0] && upload("logo", e.target.files[0])}
              />
              {s.logo_url && (
                <button type="button" className="text-red-600" onClick={() => set("logo_url", "")}>
                  Remove
                </button>
              )}
              {busy === "logo" && <span className="text-muted">Uploading…</span>}
            </div>
          </div>
        </div>
        <div>
          <span className="label">Cover photo (wide)</span>
          <div className="space-y-1 text-sm">
            {s.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.cover_url} alt="Cover" className="h-16 w-full rounded-xl object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              aria-label="Upload cover photo"
              className="block w-full text-xs"
              onChange={(e) => e.target.files?.[0] && upload("cover", e.target.files[0])}
            />
            {s.cover_url && (
              <button type="button" className="text-red-600" onClick={() => set("cover_url", "")}>
                Remove
              </button>
            )}
            {busy === "cover" && <span className="text-muted">Uploading…</span>}
          </div>
        </div>
      </div>

      <div>
        <span className="label">Brand colour</span>
        <div className="flex flex-wrap items-center gap-2">
          {BRAND_PRESETS.map((c) => (
            <button
              type="button"
              key={c}
              aria-label={`Colour ${c}`}
              onClick={() => set("brand_color", c)}
              className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom colour"
            className="h-8 w-10 cursor-pointer rounded border border-line bg-paper"
            value={color}
            onChange={(e) => set("brand_color", e.target.value)}
          />
          <input
            className="input w-28 py-1.5 font-mono text-sm"
            aria-label="Colour code"
            value={s.brand_color}
            onChange={(e) => set("brand_color", e.target.value)}
          />
        </div>
        {isTooLight(color) && (
          <p className="mt-1 text-xs text-amber-800">This colour is very light — white button text may be hard to read.</p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="tagline">
          Tagline (under your name)
        </label>
        <input
          id="tagline"
          className="input"
          maxLength={80}
          value={s.tagline}
          placeholder="Home-cooked, made to order"
          onChange={(e) => set("tagline", e.target.value)}
        />
      </div>

      {/* Live preview */}
      <div className="overflow-hidden rounded-2xl border border-line bg-cream" style={brandStyle(color)} data-testid="brand-preview">
        {s.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.cover_url} alt="" className="h-20 w-full object-cover" />
        )}
        <div className="flex items-center gap-3 p-3">
          {s.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logo_url} alt="" className="h-10 w-10 rounded-lg bg-paper object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-bold">{s.name}</div>
            <div className="truncate text-xs text-muted">{s.tagline}</div>
          </div>
          <span className="btn px-3 py-1.5 text-sm">Add</span>
        </div>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
