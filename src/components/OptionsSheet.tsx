"use client";
import { useMemo, useState } from "react";
import { money, type Currency } from "@/lib/format";
import { resolveOptions } from "@/lib/options";
import type { MenuItem } from "@/lib/types";

/** Bottom sheet where the customer picks options for a dish. */
export default function OptionsSheet({
  item,
  currency,
  onClose,
  onAdd,
  maxQty,
}: {
  item: MenuItem;
  currency: Currency;
  /** remaining daily stock for this dish (undefined = unlimited) */
  maxQty?: number;
  onClose: () => void;
  onAdd: (choiceIds: string[], labels: string[], unitPrice: number, qty: number) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => {
    // Pre-select the first available choice of required single-choice groups.
    const init: Record<string, string[]> = {};
    for (const g of item.option_groups) {
      const first = g.choices.find((c) => c.available !== false);
      if (g.required && g.max <= 1 && first) init[g.id] = [first.id];
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [touched, setTouched] = useState(false);

  const allIds = useMemo(() => Object.values(chosen).flat(), [chosen]);
  const result = resolveOptions(item, allIds);
  const unit = item.price + (result.ok ? result.extra : 0);

  function toggle(groupId: string, choiceId: string, max: number) {
    setChosen((cur) => {
      const sel = cur[groupId] ?? [];
      if (max <= 1) return { ...cur, [groupId]: sel[0] === choiceId ? [] : [choiceId] };
      if (sel.includes(choiceId)) return { ...cur, [groupId]: sel.filter((x) => x !== choiceId) };
      if (sel.length >= max) return cur;
      return { ...cur, [groupId]: [...sel, choiceId] };
    });
  }

  function add() {
    setTouched(true);
    if (!result.ok) return;
    onAdd(result.choiceIds, result.picked.map((p) => p.name), unit, qty);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={item.name}
      >
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" className="h-44 w-full object-cover" />
        )}
        <div className="space-y-5 p-5">
          <div>
            <h2 className="text-xl font-bold">{item.name}</h2>
            {item.description && <p className="text-muted">{item.description}</p>}
            <p className="mt-1 font-medium">{money(item.price, currency)}</p>
          </div>

          {item.option_groups.map((g) => {
            const sel = chosen[g.id] ?? [];
            const missing = touched && g.required && sel.length === 0;
            return (
              <fieldset key={g.id}>
                <legend className="mb-2 flex w-full items-center justify-between">
                  <span className="font-semibold">{g.name}</span>
                  <span className={`text-xs ${missing ? "font-semibold text-red-700" : "text-muted"}`}>
                    {g.required ? "Required" : "Optional"}
                    {g.max > 1 ? ` · up to ${g.max}` : ""}
                  </span>
                </legend>
                <div className="space-y-1.5">
                  {g.choices.map((c) => {
                    const on = sel.includes(c.id);
                    const disabled = c.available === false || (!on && g.max > 1 && sel.length >= g.max);
                    return (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 ${
                          on ? "border-brand bg-brand/5" : "border-line"
                        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <input
                          type={g.max <= 1 ? "radio" : "checkbox"}
                          name={g.id}
                          className="h-4 w-4 accent-brand"
                          checked={on}
                          disabled={disabled}
                          onChange={() => toggle(g.id, c.id, g.max)}
                          onClick={() => g.max <= 1 && on && !g.required && toggle(g.id, c.id, g.max)}
                        />
                        <span className="flex-1">{c.name}</span>
                        {c.available === false ? (
                          <span className="text-sm text-muted">Sold out</span>
                        ) : c.price ? (
                          <span className="text-sm text-muted">+{money(c.price, currency)}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {touched && !result.ok && <p className="text-sm text-red-700">{result.error}</p>}

          <div className="flex items-center gap-3">
            <div className="flex items-center overflow-hidden rounded-xl border border-line">
              <button className="px-3 py-2 text-lg" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">−</button>
              <span className="w-6 text-center font-semibold">{qty}</span>
              <button className="px-3 py-2 text-lg disabled:opacity-30" disabled={maxQty !== undefined && qty >= maxQty} onClick={() => setQty(qty + 1)} aria-label="Increase">+</button>
            </div>
            <button className="btn flex-1 py-3" onClick={add} disabled={maxQty !== undefined && (maxQty < 1 || qty > maxQty)}>
              Add · {money(unit * qty, currency)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
