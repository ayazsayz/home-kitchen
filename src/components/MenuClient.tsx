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
}: {
  settings: Settings;
  availability: Availability;
  categories: Category[];
  items: MenuItem[];
  /** dishes with a daily limit → how many are left today */
  remaining?: Record<string, number>;
  rating?: RatingSummary | null;
  reviews?: PublicReview[];
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

  return (
    <div className="mx-auto max-w-2xl pb-32">
      {settings.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={settings.cover_url} alt="" className="h-44 w-full object-cover sm:h-56 sm:rounded-b-3xl" data-testid="cover" />
      )}
      <header className={`px-4 pb-4 ${settings.cover_url ? "pt-0" : "pt-8"}`}>
        <div className={`flex items-end gap-3 ${settings.cover_url && settings.logo_url ? "-mt-10" : ""}`}>
          {settings.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt={`${settings.name} logo`} data-testid="logo"
              className="h-20 w-20 shrink-0 rounded-2xl border-4 border-cream bg-paper object-contain shadow-sm" />
          )}
          <h1 className={`text-3xl font-bold tracking-tight ${settings.cover_url && !settings.logo_url ? "mt-4" : ""}`}>{settings.name}</h1>
        </div>
        <p className="mt-1 text-muted">
          {settings.tagline ? `${settings.tagline} · ` : ""}{settings.card_enabled ? t("cashOrCard") : t("cashOnDelivery")}
        </p>
        {rating && rating.count > 0 && (
          <a href="#reviews" className="mt-1 inline-flex items-center gap-1 text-sm" data-testid="menu-rating">
            <span className="text-amber-500">★</span>
            <b>{rating.avg.toFixed(1)}</b>
            <span className="text-muted">· {t("reviewsCount", { n: rating.count })}</span>
          </a>
        )}
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
        <input className="input mt-4" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </header>

      {groups.length > 1 && (
        <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-line bg-cream/95 px-4 py-2 backdrop-blur">
          {groups.map((g) => (
            <a key={g.cat.id} href={`#c-${g.cat.id}`} className="shrink-0 rounded-full border border-line bg-paper px-3 py-1 text-sm">
              {g.cat.name}
            </a>
          ))}
        </nav>
      )}

      <main className="space-y-8 px-4 pt-4">
        {groups.map((g) => (
          <section key={g.cat.id} id={`c-${g.cat.id}`} className="scroll-mt-14">
            <h2 className="mb-3 text-lg font-semibold">{g.cat.name}</h2>
            <ul className="space-y-3">
              {g.items.map((i) => {
                const withOpts = hasOptions(i);
                const line = withOpts ? undefined : simpleLine(i);
                const inCart = cart.qtyOfItem(i.id);
                const left = remaining[i.id]; // undefined = no daily limit
                const soldOutToday = left === 0;
                const canAddMore = left === undefined || inCart < left;
                return (
                  <li key={i.id} className={`card flex gap-3 p-3 ${!i.available ? "opacity-50" : ""}`}>
                    {i.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{nameOf(i)}</div>
                      {i.description && <p className="text-sm text-muted">{descOf(i)}</p>}
                      <div className="mt-1 font-medium">
                        {money(i.price, cur)}
                        {withOpts && <span className="ms-2 text-xs font-normal text-muted">{t("optionsAvailable")}</span>}
                      </div>
                      {left !== undefined && left > 0 && left <= 5 && i.available && (
                        <div className="mt-0.5 text-xs font-semibold text-brand-dark">{t("onlyLeft", { n: left })}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end justify-center gap-1">
                      {!i.available ? (
                        <span className="text-sm text-muted">{t("soldOut")}</span>
                      ) : soldOutToday && !line ? (
                        <span className="text-end text-sm text-muted">{t("soldOutToday")}</span>
                      ) : line ? (
                        <Stepper qty={line.qty} max={left} onChange={(n) => cart.setQty(line.key, left === undefined ? n : Math.min(n, left))} />
                      ) : (
                        <button
                          className="btn px-3 py-1.5"
                          disabled={!availability.canOrder || !canAddMore}
                          onClick={() =>
                            withOpts
                              ? setPicking(i)
                                : cart.add({ id: i.id, name: nameOf(i), price: i.price, choiceIds: [], optionLabels: [] })
                          }
                        >
                          {t("add")}
                        </button>
                      )}
                      {withOpts && inCart > 0 && <span className="text-xs text-muted">{t("inCart", { n: inCart })}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="text-muted">{t("noMatch")}</p>}
        {reviews.length > 0 && (
          <section id="reviews" className="scroll-mt-14" data-testid="menu-reviews">
            <h2 className="mb-3 text-lg font-semibold">{t("whatPeopleSay")}</h2>
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="card p-3">
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
          onClose={() => setPicking(null)}
          onAdd={(choiceIds, labels, unit, qty) => {
            cart.add({ id: picking.id, name: nameOf(picking), price: unit, choiceIds, optionLabels: labels }, qty);
            setPicking(null);
          }}
        />
      )}

      {cart.ready && cart.count > 0 && availability.canOrder && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 p-3 backdrop-blur">
          <Link href="/checkout" className="btn mx-auto flex w-full max-w-2xl justify-between py-3">
            <span>{cart.count > 1 ? t("itemsMany", { n: cart.count }) : t("itemsOne")}</span>
            <span>{t("checkout")} · {money(cart.subtotal, cur)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export function Stepper({ qty, onChange, max }: { qty: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-line">
      <button className="px-3 py-1.5 text-lg" onClick={() => onChange(qty - 1)} aria-label="Decrease">−</button>
      <span className="w-6 text-center font-semibold">{qty}</span>
      <button className="px-3 py-1.5 text-lg disabled:opacity-30" disabled={max !== undefined && qty >= max} onClick={() => onChange(qty + 1)} aria-label="Increase">+</button>
    </div>
  );
}
