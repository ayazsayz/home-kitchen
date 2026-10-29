"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { currencyOf, money } from "@/lib/format";
import type { Category, MenuItem, Settings } from "@/lib/types";
import type { Availability } from "@/lib/data";
import { fmtWhen } from "@/lib/schedule";
import OptionsSheet from "./OptionsSheet";

export default function MenuClient({
  settings,
  availability,
  categories,
  items,
}: {
  settings: Settings;
  availability: Availability;
  categories: Category[];
  items: MenuItem[];
}) {
  const cart = useCart();
  const cur = currencyOf(settings);
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState<MenuItem | null>(null);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const visible = items.filter(
      (i) => !term || i.name.toLowerCase().includes(term) || i.description?.toLowerCase().includes(term),
    );
    const cats = [...categories, { id: "__none", name: "Other", sort: 9999 }];
    return cats
      .map((c) => ({ cat: c, items: visible.filter((i) => (i.category_id ?? "__none") === c.id) }))
      .filter((g) => g.items.length);
  }, [categories, items, q]);

  const hasOptions = (i: MenuItem) => i.option_groups?.some((g) => g.choices.length > 0);
  const simpleLine = (i: MenuItem) => cart.lines.find((l) => l.id === i.id && l.choiceIds.length === 0);

  return (
    <div className="mx-auto max-w-2xl pb-32">
      <header className="px-4 pt-8 pb-4">
        <h1 className="text-3xl font-bold tracking-tight">{settings.name}</h1>
        <p className="mt-1 text-muted">
          Home-cooked, made to order · {settings.card_enabled ? "Cash or card" : "Cash on delivery"}
        </p>
        {!availability.asap && (
          <div className="mt-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-brand-dark">
            {availability.canOrder ? (
              <>
                We&apos;re closed right now{availability.nextOpen && <> · opens {fmtWhen(availability.nextOpen, settings.timezone)}</>}.{" "}
                <b>You can pre-order for later.</b>
              </>
            ) : (
              <>
                {settings.closed_message}
                {availability.nextOpen && <> Opens {fmtWhen(availability.nextOpen, settings.timezone)}.</>}
              </>
            )}
          </div>
        )}
        <input className="input mt-4" placeholder="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} />
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
                return (
                  <li key={i.id} className={`card flex gap-3 p-3 ${!i.available ? "opacity-50" : ""}`}>
                    {i.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{i.name}</div>
                      {i.description && <p className="text-sm text-muted">{i.description}</p>}
                      <div className="mt-1 font-medium">
                        {money(i.price, cur)}
                        {withOpts && <span className="ml-2 text-xs font-normal text-muted">Options available</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end justify-center gap-1">
                      {!i.available ? (
                        <span className="text-sm text-muted">Sold out</span>
                      ) : line ? (
                        <Stepper qty={line.qty} onChange={(n) => cart.setQty(line.key, n)} />
                      ) : (
                        <button
                          className="btn px-3 py-1.5"
                          disabled={!availability.canOrder}
                          onClick={() =>
                            withOpts
                              ? setPicking(i)
                              : cart.add({ id: i.id, name: i.name, price: i.price, choiceIds: [], optionLabels: [] })
                          }
                        >
                          Add
                        </button>
                      )}
                      {withOpts && inCart > 0 && <span className="text-xs text-muted">{inCart} in cart</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="text-muted">No dishes match your search.</p>}
      </main>

      {picking && (
        <OptionsSheet
          item={picking}
          currency={cur}
          onClose={() => setPicking(null)}
          onAdd={(choiceIds, labels, unit, qty) => {
            cart.add({ id: picking.id, name: picking.name, price: unit, choiceIds, optionLabels: labels }, qty);
            setPicking(null);
          }}
        />
      )}

      {cart.ready && cart.count > 0 && availability.canOrder && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 p-3 backdrop-blur">
          <Link href="/checkout" className="btn mx-auto flex w-full max-w-2xl justify-between py-3">
            <span>
              {cart.count} item{cart.count > 1 ? "s" : ""}
            </span>
            <span>Checkout · {money(cart.subtotal, cur)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export function Stepper({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center overflow-hidden rounded-xl border border-line">
      <button className="px-3 py-1.5 text-lg" onClick={() => onChange(qty - 1)} aria-label="Decrease">−</button>
      <span className="w-6 text-center font-semibold">{qty}</span>
      <button className="px-3 py-1.5 text-lg" onClick={() => onChange(qty + 1)} aria-label="Increase">+</button>
    </div>
  );
}
