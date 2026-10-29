"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { currencyOf, money } from "@/lib/format";
import type { Category, MenuItem, Settings } from "@/lib/types";
import type { Availability } from "@/lib/data";
import { fmtWhen } from "@/lib/schedule";
import OptionsSheet from "./OptionsSheet";
import LoyaltyCard from "./LoyaltyCard";
import InstallPrompt from "./InstallPrompt";
import LastOrderCard from "./LastOrderCard";
import { LanguageSwitcher, useI18n } from "./I18n";
import { localize } from "@/lib/i18n";
import type { PublicReview, RatingSummary } from "@/lib/reviews";

export default function MenuClient({
  settings,
  availability,
  categories,
  items,
  remaining = {},
  rating,
  reviews = [],
  bestsellers = [],
}: {
  settings: Settings;
  availability: Availability;
  categories: Category[];
  items: MenuItem[];
  /** dishes with a daily limit → how many are left today */
  remaining?: Record<string, number>;
  rating?: RatingSummary | null;
  reviews?: PublicReview[];
  /** dish ids of the current best-sellers (🔥 badge) */
  bestsellers?: string[];
}) {
  const { t, lang } = useI18n();
  const nameOf = (i: MenuItem) => localize(i.name, i.name_i18n, lang);
  const descOf = (i: MenuItem) => localize(i.description ?? "", i.description_i18n, lang);
  const cart = useCart();
  const cur = currencyOf(settings);
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState<MenuItem | null>(null);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const hay = (i: MenuItem) => [i.name, i.description ?? "", nameOf(i), descOf(i)].join(" ").toLowerCase();
    const visible = items.filter((i) => !term || hay(i).includes(term));
    const cats: Category[] = [
      ...categories.map((c) => ({ ...c, name: localize(c.name, c.name_i18n, lang) })),
      { id: "__none", name: t("other"), sort: 9999 },
    ];
    return cats
      .map((c) => ({ cat: c, items: visible.filter((i) => (i.category_id ?? "__none") === c.id) }))
      .filter((g) => g.items.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, items, q, lang]);

  const hasOptions = (i: MenuItem) => i.option_groups?.some((g) => g.choices.length > 0);
  const simpleLine = (i: MenuItem) => cart.lines.find((l) => l.id === i.id && l.choiceIds.length === 0);
  const best = new Set(bestsellers);
  const badgesOf = (i: MenuItem) => {
    const b: { key: string; label: string; tone: string }[] = [];
    if (best.has(i.id)) b.push({ key: "best", label: `🔥 ${t("bestseller")}`, tone: "bg-amber-400 text-ink" });
    if (i.tags?.includes("chef")) b.push({ key: "chef", label: `⭐ ${t("tagChef")}`, tone: "bg-ink text-white" });
    if (i.tags?.includes("new")) b.push({ key: "new", label: `🆕 ${t("tagNew")}`, tone: "bg-ok text-white" });
    if (i.tags?.includes("spicy")) b.push({ key: "spicy", label: `🌶️ ${t("tagSpicy")}`, tone: "bg-red-600 text-white" });
    return b;
  };
  const deliveryPill =
    settings.delivery_fee > 0 ? t("deliveryFeePill", { amount: money(settings.delivery_fee, cur) }) : t("freeDeliveryPill");
  const open = availability.asap;

  /** Add button / stepper / sold-out note for one dish. */
  function action(i: MenuItem, full = false) {
    const withOpts = hasOptions(i);
    const line = withOpts ? undefined : simpleLine(i);
    const inCart = cart.qtyOfItem(i.id);
    const left = remaining[i.id]; // undefined = no daily limit
    const canAddMore = left === undefined || inCart < left;
    if (!i.available) return <span className="text-sm text-muted">{t("soldOut")}</span>;
    if (left === 0 && !line) return <span className="text-end text-sm text-muted">{t("soldOutToday")}</span>;
    if (line)
      return <Stepper full={full} qty={line.qty} max={left} onChange={(n) => cart.setQty(line.key, left === undefined ? n : Math.min(n, left))} />;
    return (
      <div className={`flex flex-col gap-1 ${full ? "w-full" : "items-end"}`}>
        <button
          className={`btn py-1.5 ${full ? "w-full" : "px-3"}`}
          disabled={!availability.canOrder || !canAddMore}
          onClick={() => (withOpts ? setPicking(i) : cart.add({ id: i.id, name: nameOf(i), price: i.price, choiceIds: [], optionLabels: [] }))}
        >
          <span aria-hidden>+</span> {t("add")}
        </button>
        {withOpts && inCart > 0 && <span className="text-center text-xs text-muted">{t("inCart", { n: inCart })}</span>}
      </div>
    );
  }

  const stockNote = (i: MenuItem) => {
    const left = remaining[i.id];
    return left !== undefined && left > 0 && left <= 5 && i.available ? (
      <div className="text-xs font-semibold text-brand-dark">{t("onlyLeft", { n: left })}</div>
    ) : null;
  };

  return (
    <div className="mx-auto max-w-2xl pb-32">
      {/* ---------- Hero ---------- */}
      <div className="relative">
        {settings.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.cover_url} alt="" className="h-52 w-full object-cover sm:h-64 sm:rounded-b-3xl" data-testid="cover" />
        ) : (
          <div className="hero-pattern h-36 w-full bg-gradient-to-br from-brand to-brand-dark sm:h-44 sm:rounded-b-3xl" aria-hidden />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/40 to-transparent sm:rounded-b-3xl" aria-hidden />
      </div>
      <header className="relative -mt-12 px-4 pb-4">
        <div className="flex items-end gap-3">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt={`${settings.name} logo`} data-testid="logo"
              className="h-24 w-24 shrink-0 rounded-3xl border-4 border-cream bg-paper object-contain shadow-md" />
          ) : (
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl border-4 border-cream bg-paper text-4xl shadow-md" aria-hidden>
              {emojiFor(settings.name)}
            </div>
          )}
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{settings.name}</h1>
        <p className="mt-0.5 text-muted">
          {settings.tagline ? `${settings.tagline} · ` : ""}{settings.card_enabled ? t("cashOrCard") : t("cashOnDelivery")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm" data-testid="info-pills">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${open ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            <span className={`h-2 w-2 rounded-full ${open ? "bg-ok" : "bg-red-600"}`} />
            {open ? t("openNow") : t("closedPill")}
          </span>
          {rating && rating.count > 0 && (
            <a href="#reviews" className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 shadow-sm ring-1 ring-line" data-testid="menu-rating">
              <span className="text-amber-500">★</span>
              <b>{rating.avg.toFixed(1)}</b>
              <span className="text-muted">· {t("reviewsCount", { n: rating.count })}</span>
            </a>
          )}
          {settings.eta_minutes ? (
            <span className="rounded-full bg-paper px-3 py-1 shadow-sm ring-1 ring-line" data-testid="eta">🛵 {t("etaMin", { n: settings.eta_minutes })}</span>
          ) : null}
          <span className="rounded-full bg-paper px-3 py-1 shadow-sm ring-1 ring-line">{deliveryPill}</span>
          {settings.min_order > 0 && (
            <span className="rounded-full bg-paper px-3 py-1 shadow-sm ring-1 ring-line">{t("minOrderPill", { amount: money(settings.min_order, cur) })}</span>
          )}
        </div>
        <div className="mt-3"><LanguageSwitcher /></div>
        {!availability.asap && (
          <div className="mt-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-brand-dark">
            {availability.canOrder ? (
              <>
                {t("closedNow")}{availability.nextOpen && <> · {t("opensAt", { when: fmtWhen(availability.nextOpen, settings.timezone, undefined, lang) })}</>}.{" "}
                <b>{t("canPreorder")}</b>
              </>
            ) : (
              <>
                {settings.closed_message}
                {availability.nextOpen && <> {t("opensFull", { when: fmtWhen(availability.nextOpen, settings.timezone, undefined, lang) })}</>}
              </>
            )}
          </div>
        )}
        <LastOrderCard />
        {settings.loyalty_enabled && <LoyaltyCard currency={cur} />}
        <InstallPrompt name={settings.name} />
        <div className="relative mt-4">
          <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-muted" aria-hidden>🔍</span>
          <input className="input" style={{ paddingInlineStart: "2.5rem" }} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      {groups.length > 1 && (
        <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-line bg-cream/95 px-4 py-2.5 backdrop-blur">
          {groups.map((g) => (
            <a key={g.cat.id} href={`#c-${g.cat.id}`}
              className="shrink-0 rounded-full border border-line bg-paper px-4 py-1.5 text-sm font-semibold shadow-sm hover:border-brand hover:text-brand">
              {g.cat.name}
            </a>
          ))}
        </nav>
      )}

      <main className="space-y-8 px-4 pt-5">
        {groups.map((g) => {
          // Categories with photos or descriptions get big picture cards; plain extras (e.g. add-ons) stay a compact list.
          const visual = g.items.some((i) => i.image_url || i.description?.trim());
          return (
            <section key={g.cat.id} id={`c-${g.cat.id}`} className="scroll-mt-16">
              <h2 className="mb-3 text-xl font-extrabold tracking-tight">{g.cat.name}</h2>
              {visual ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="dish-grid">
                  {g.items.map((i) => (
                    <li key={i.id} className={`card flex flex-col overflow-hidden shadow-sm ${!i.available ? "opacity-50" : ""}`}>
                      <button type="button" className="relative block aspect-square w-full overflow-hidden bg-cream" onClick={() => setPicking(i)}
                        aria-label={nameOf(i)}>
                        <DishImage item={i} />
                        <Badges list={badgesOf(i)} />
                      </button>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <button type="button" className="text-start font-bold leading-snug" onClick={() => setPicking(i)}>{nameOf(i)}</button>
                        {i.description && <p className="line-clamp-2 text-xs text-muted">{descOf(i)}</p>}
                        <div className="mt-auto pt-1 font-bold">
                          {money(i.price, cur)}
                          {hasOptions(i) && <span className="ms-1 block text-[11px] font-normal text-muted">{t("optionsAvailable")}</span>}
                        </div>
                        {stockNote(i)}
                        {action(i, true)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="card divide-y divide-line shadow-sm">
                  {g.items.map((i) => (
                    <li key={i.id} className={`flex items-center gap-3 p-3 ${!i.available ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold">{nameOf(i)}</span>
                          {badgesOf(i).map((b) => (
                            <span key={b.key} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.tone}`}>{b.label}</span>
                          ))}
                        </div>
                        {i.description && <p className="text-sm text-muted">{descOf(i)}</p>}
                        <div className="mt-0.5 font-medium">
                          {money(i.price, cur)}
                          {hasOptions(i) && <span className="ms-2 text-xs font-normal text-muted">{t("optionsAvailable")}</span>}
                        </div>
                        {stockNote(i)}
                      </div>
                      {action(i)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {groups.length === 0 && <p className="text-muted">{t("noMatch")}</p>}
        {reviews.length > 0 && (
          <section id="reviews" className="scroll-mt-16" data-testid="menu-reviews">
            <h2 className="mb-3 text-xl font-extrabold tracking-tight">{t("whatPeopleSay")}</h2>
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="card p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <b>{r.name}</b>
                    <span className="text-amber-500" aria-label={`${r.rating}/5`}>{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>
                  </div>
                  {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {picking && (
        <OptionsSheet
          item={picking}
          currency={cur}
          maxQty={remaining[picking.id] === undefined ? undefined : Math.max(0, remaining[picking.id] - cart.qtyOfItem(picking.id))}
          disabled={!picking.available || !availability.canOrder}
          onClose={() => setPicking(null)}
          onAdd={(choiceIds, labels, unit, qty) => {
            cart.add({ id: picking.id, name: nameOf(picking), price: unit, choiceIds, optionLabels: labels }, qty);
            setPicking(null);
          }}
        />
      )}

      {cart.ready && cart.count > 0 && availability.canOrder && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3">
          <Link href="/checkout" className="btn mx-auto flex w-full max-w-2xl justify-between rounded-2xl py-3.5 shadow-lg shadow-brand/30">
            <span className="flex items-center gap-2">
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-sm font-bold text-brand">{cart.count}</span>
              {cart.count > 1 ? t("itemsMany", { n: cart.count }) : t("itemsOne")}
            </span>
            <span>{t("checkout")} · {money(cart.subtotal, cur)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export function Stepper({ qty, onChange, max, full }: { qty: number; onChange: (n: number) => void; max?: number; full?: boolean }) {
  return (
    <div className={`flex items-center overflow-hidden rounded-xl border border-line bg-paper ${full ? "w-full justify-between" : ""}`}>
      <button className="px-3 py-1.5 text-lg" onClick={() => onChange(qty - 1)} aria-label="Decrease">−</button>
      <span className="w-6 text-center font-semibold">{qty}</span>
      <button className="px-3 py-1.5 text-lg disabled:opacity-30" disabled={max !== undefined && qty >= max} onClick={() => onChange(qty + 1)} aria-label="Increase">+</button>
    </div>
  );
}

/** Food emoji for dishes without a photo. */
export function emojiFor(name: string) {
  const n = name.toLowerCase();
  const map: [RegExp, string][] = [
    [/burger|patty/, "🍔"], [/fries|chips/, "🍟"], [/pizza/, "🍕"], [/wrap|shawarma|roll/, "🌯"], [/sandwich|sub/, "🥪"],
    [/biryani|rice|pulao|chawal/, "🍛"], [/karahi|curry|daal|dal|qorma|handi/, "🍲"], [/chicken|wing|tikka|broast/, "🍗"],
    [/naan|bread|paratha|roti/, "🫓"], [/salad/, "🥗"], [/sauce|dip|mayo/, "🥫"], [/cheese/, "🧀"], [/bacon|bologna|sausage/, "🥓"],
    [/cake|dessert|brownie|kheer/, "🍰"], [/ice ?cream|shake/, "🍨"], [/tea|chai|coffee/, "☕"], [/juice|drink|cola|soda|water|lassi/, "🥤"],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? "🍽️";
}

function DishImage({ item }: { item: MenuItem }) {
  return item.image_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-105" />
  ) : (
    <div className="hero-pattern grid h-full w-full place-items-center bg-gradient-to-br from-brand/15 to-brand/35 text-6xl" aria-hidden>
      {emojiFor(item.name)}
    </div>
  );
}

function Badges({ list }: { list: { key: string; label: string; tone: string }[] }) {
  if (!list.length) return null;
  return (
    <div className="absolute start-2 top-2 flex flex-col items-start gap-1">
      {list.map((b) => (
        <span key={b.key} className={`rounded-full px-2 py-0.5 text-[11px] font-bold shadow ${b.tone}`} data-badge={b.key}>{b.label}</span>
      ))}
    </div>
  );
}
