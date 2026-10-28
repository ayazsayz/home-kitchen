"use client";
import { newId } from "@/lib/options";
import type { OptionGroup } from "@/lib/types";

const PRESETS: { label: string; group: () => OptionGroup }[] = [
  {
    label: "Spice level",
    group: () => ({
      id: newId(), name: "Spice level", required: true, max: 1,
      choices: ["Mild", "Medium", "Spicy"].map((n) => ({ id: newId(), name: n, price: 0 })),
    }),
  },
  {
    label: "Size",
    group: () => ({
      id: newId(), name: "Size", required: true, max: 1,
      choices: [
        { id: newId(), name: "Regular", price: 0 },
        { id: newId(), name: "Large", price: 8 },
      ],
    }),
  },
  {
    label: "Add-ons",
    group: () => ({
      id: newId(), name: "Add-ons", required: false, max: 3,
      choices: [
        { id: newId(), name: "Extra raita", price: 2 },
        { id: newId(), name: "Boiled egg", price: 2 },
      ],
    }),
  },
];

/** Edits a dish's option groups (Size, Spice level, Add-ons…). */
export default function OptionGroupsEditor({
  value,
  onChange,
}: {
  value: OptionGroup[];
  onChange: (v: OptionGroup[]) => void;
}) {
  const setGroup = (i: number, g: Partial<OptionGroup>) => onChange(value.map((x, k) => (k === i ? { ...x, ...g } : x)));
  const removeGroup = (i: number) => onChange(value.filter((_, k) => k !== i));
  const moveGroup = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Options</span>
        <span className="flex-1" />
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="rounded-lg border border-line px-2 py-1 text-xs"
            onClick={() => onChange([...value, p.group()])}>
            + {p.label}
          </button>
        ))}
        <button type="button" className="rounded-lg border border-line px-2 py-1 text-xs"
          onClick={() => onChange([...value, { id: newId(), name: "", required: false, max: 1, choices: [{ id: newId(), name: "", price: 0 }] }])}>
          + Custom
        </button>
      </div>

      {value.length === 0 && <p className="text-sm text-muted">No options. Customers add this dish with one tap.</p>}

      {value.map((g, gi) => (
        <div key={g.id} className="space-y-2 rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <input className="input py-1.5 font-medium" placeholder="Group name, e.g. Size" required value={g.name}
              onChange={(e) => setGroup(gi, { name: e.target.value })} />
            <button type="button" className="px-1 text-muted disabled:opacity-30" disabled={gi === 0} onClick={() => moveGroup(gi, -1)} aria-label="Move up">↑</button>
            <button type="button" className="px-1 text-muted disabled:opacity-30" disabled={gi === value.length - 1} onClick={() => moveGroup(gi, 1)} aria-label="Move down">↓</button>
            <button type="button" className="px-1 text-red-600" onClick={() => removeGroup(gi)} aria-label="Remove group">✕</button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={g.required}
                onChange={(e) => setGroup(gi, { required: e.target.checked })} />
              Required
            </label>
            <label className="flex items-center gap-1.5">
              Customer picks
              <select className="rounded-lg border border-line bg-paper px-1.5 py-1" value={g.max}
                onChange={(e) => setGroup(gi, { max: Number(e.target.value) })}>
                <option value={1}>one</option>
                {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>up to {n}</option>)}
              </select>
            </label>
          </div>
          <ul className="space-y-1.5">
            {g.choices.map((c, ci) => (
              <li key={c.id} className="flex items-center gap-2">
                <input className="input py-1.5" placeholder="Choice, e.g. Large" required value={c.name}
                  onChange={(e) => setGroup(gi, { choices: g.choices.map((x, k) => (k === ci ? { ...x, name: e.target.value } : x)) })} />
                <div className="flex w-28 shrink-0 items-center gap-1">
                  <span className="text-sm text-muted">+</span>
                  <input className="input py-1.5" type="number" min={0} step="any" value={c.price}
                    onChange={(e) => setGroup(gi, { choices: g.choices.map((x, k) => (k === ci ? { ...x, price: Number(e.target.value) || 0 } : x)) })} />
                </div>
                <label className="flex shrink-0 items-center gap-1 text-xs" title="Available">
                  <input type="checkbox" className="h-4 w-4 accent-ok" checked={c.available !== false}
                    onChange={(e) => setGroup(gi, { choices: g.choices.map((x, k) => (k === ci ? { ...x, available: e.target.checked } : x)) })} />
                  On
                </label>
                <button type="button" className="px-1 text-red-600 disabled:opacity-30" disabled={g.choices.length === 1}
                  onClick={() => setGroup(gi, { choices: g.choices.filter((_, k) => k !== ci) })} aria-label="Remove choice">✕</button>
              </li>
            ))}
          </ul>
          <button type="button" className="text-sm text-brand"
            onClick={() => setGroup(gi, { choices: [...g.choices, { id: newId(), name: "", price: 0 }] })}>
            + Add choice
          </button>
        </div>
      ))}
    </div>
  );
}
