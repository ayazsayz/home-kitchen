"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normalise } from "@/lib/format";
import { useShop } from "@/lib/use-currency";
import { dateIn, dayStartIso, todayIn } from "@/lib/tz";
import type { Category, MenuItem } from "@/lib/types";
import OptionGroupsEditor from "./OptionGroupsEditor";

type Draft = Omit<MenuItem, "id"> & { id?: string };
const EMPTY: Draft = {
  category_id: null, name: "", description: "", price: 0, image_url: "", available: true, sort: 0, option_groups: [], daily_limit: null,
};

export default function MenuAdmin() {
  const db = useMemo(() => supabaseBrowser(), []);
  const { cur, tz, ready } = useShop();
  const [soldToday, setSoldToday] = useState<Record<string, number>>({});
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newCat, setNewCat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([
      db.from("categories").select("*").order("sort"),
      db.from("menu_items").select("*").order("sort"),
    ]);
    setCats(c.data ?? []);
    setItems((i.data ?? []).map((x) => ({ ...normalise(x), option_groups: x.option_groups ?? [] }) as MenuItem));
    if (!ready) return;
    // Sold today (for daily limits): orders whose service day is today in the shop's time zone.
    const today = todayIn(tz);
    const from = dayStartIso(today, tz);
    const { data: os } = await db
      .from("orders")
      .select("status, created_at, scheduled_for, order_items(menu_item_id, qty)")
      .or(`created_at.gte.${from},scheduled_for.gte.${from}`)
      .neq("status", "rejected");
    const sold: Record<string, number> = {};
    for (const o of os ?? []) {
      if (dateIn(o.scheduled_for ?? o.created_at, tz) !== today) continue;
      for (const it of (o.order_items ?? []) as { menu_item_id: string | null; qty: number }[]) {
        if (it.menu_item_id) sold[it.menu_item_id] = (sold[it.menu_item_id] ?? 0) + it.qty;
      }
    }
    setSoldToday(sold);
  }, [db, tz, ready]);
  useEffect(() => {
    load();
  }, [load]);

  async function addCategory() {
    if (!newCat.trim()) return;
    await db.from("categories").insert({ name: newCat.trim(), sort: cats.length + 1 });
    setNewCat("");
    load();
  }
  async function renameCategory(c: Category) {
    const name = prompt("Category name", c.name);
    if (!name?.trim()) return;
    await db.from("categories").update({ name: name.trim() }).eq("id", c.id);
    load();
  }
  async function deleteCategory(c: Category) {
    if (!confirm(`Delete "${c.name}"? Its dishes move to "Other".`)) return;
    await db.from("categories").delete().eq("id", c.id);
    load();
  }
  async function moveCategory(c: Category, dir: -1 | 1) {
    const idx = cats.findIndex((x) => x.id === c.id);
    const swap = cats[idx + dir];
    if (!swap) return;
    await Promise.all([
      db.from("categories").update({ sort: swap.sort }).eq("id", c.id),
      db.from("categories").update({ sort: c.sort }).eq("id", swap.id),
    ]);
    load();
  }

  async function toggle(i: MenuItem) {
    setItems((cur) => cur.map((x) => (x.id === i.id ? { ...x, available: !x.available } : x)));
    await db.from("menu_items").update({ available: !i.available }).eq("id", i.id);
  }

  async function uploadImage(file: File) {
    setBusy(true);
    setErr("");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("menu").upload(path, file, { cacheControl: "31536000" });
    setBusy(false);
    if (error) return setErr(error.message);
    const { data } = db.storage.from("menu").getPublicUrl(path);
    setDraft((d) => (d ? { ...d, image_url: data.publicUrl } : d));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setErr("");
    const { id, ...row } = draft;
    const payload = {
      ...row,
      price: Number(row.price) || 0,
      sort: Number(row.sort) || 0,
      daily_limit: row.daily_limit === null || (row.daily_limit as unknown) === "" ? null : Math.max(0, Math.round(Number(row.daily_limit))),
      // drop empty choices / groups
      option_groups: row.option_groups
        .map((g) => ({ ...g, name: g.name.trim(), choices: g.choices.filter((c) => c.name.trim()) }))
        .filter((g) => g.name && g.choices.length),
    };
    const { error } = id
      ? await db.from("menu_items").update(payload).eq("id", id)
      : await db.from("menu_items").insert(payload);
    setBusy(false);
    if (error) return setErr(error.message);
    setDraft(null);
    load();
  }

  async function remove() {
    if (!draft?.id || !confirm(`Delete "${draft.name}"? Past orders keep their copy.`)) return;
    await db.from("menu_items").delete().eq("id", draft.id);
    setDraft(null);
    load();
  }

  const groups = [...cats, { id: "__none", name: "Other", sort: 9999 }]
    .map((c) => ({ c, list: items.filter((i) => (i.category_id ?? "__none") === c.id) }))
    .filter((g) => g.c.id !== "__none" || g.list.length);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <h2 className="font-semibold">Categories</h2>
        <ul className="card divide-y divide-line">
          {cats.map((c, idx) => (
            <li key={c.id} className="flex items-center gap-1 px-3 py-2 text-sm">
              <span className="flex-1">{c.name}</span>
              <button className="px-1 text-muted disabled:opacity-30" disabled={idx === 0} onClick={() => moveCategory(c, -1)}>↑</button>
              <button className="px-1 text-muted disabled:opacity-30" disabled={idx === cats.length - 1} onClick={() => moveCategory(c, 1)}>↓</button>
              <button className="px-1 text-muted" onClick={() => renameCategory(c)}>Edit</button>
              <button className="px-1 text-red-600" onClick={() => deleteCategory(c)}>✕</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="input py-2" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <button className="btn-ghost" onClick={addCategory}>Add</button>
        </div>
      </aside>

      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Menu</h1>
          <button className="btn" onClick={() => setDraft({ ...EMPTY, category_id: cats[0]?.id ?? null })}>+ Add dish</button>
        </div>

        {groups.map(({ c, list }) => (
          <div key={c.id}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{c.name}</h3>
            <ul className="card divide-y divide-line">
              {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">No dishes yet</li>}
              {list.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                  {i.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-cream" />
                  )}
                  <button className="min-w-0 flex-1 text-left" onClick={() => setDraft(i)}>
                    <div className="font-medium">{i.name}</div>
                    <div className="truncate text-sm text-muted">
                      {i.option_groups.length > 0 && (
                        <span className="mr-1 rounded bg-cream px-1.5 text-xs">{i.option_groups.map((g) => g.name).join(" · ")}</span>
                      )}
                      {i.description}
                    </div>
                  </button>
                  {i.daily_limit != null && (
                    <span
                      className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${
                        (soldToday[i.id] ?? 0) >= i.daily_limit ? "bg-red-100 text-red-800" : "bg-cream text-muted"
                      }`}
                      title="Sold today / daily limit"
                    >
                      {soldToday[i.id] ?? 0}/{i.daily_limit} today
                    </span>
                  )}
                  <span className="w-24 text-right">{money(i.price, cur)}</span>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-ok" checked={i.available} onChange={() => toggle(i)} />
                    {i.available ? "Available" : "Sold out"}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {draft && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto p-5">
            <h2 className="text-lg font-bold">{draft.id ? "Edit dish" : "New dish"}</h2>
            <div>
              <label className="label">Name</label>
              <input className="input" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="label">Price</label>
                <input className="input" type="number" min={0} step="any" required value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value as unknown as number })} />
              </div>
              <div className="col-span-2">
                <label className="label">Category</label>
                <select className="input" value={draft.category_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, category_id: e.target.value || null })}>
                  <option value="">Other</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Sort order</label>
                <input className="input" type="number" value={draft.sort}
                  onChange={(e) => setDraft({ ...draft, sort: e.target.value as unknown as number })} />
              </div>
              <div className="col-span-2">
                <label className="label">Photo</label>
                <input type="file" accept="image/*" className="text-sm"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </div>
            </div>
            {draft.image_url && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                <button type="button" className="text-sm text-red-600" onClick={() => setDraft({ ...draft, image_url: "" })}>Remove photo</button>
              </div>
            )}
            <div>
              <label className="label" htmlFor="daily-limit">Daily limit (leave empty for no limit)</label>
              <input id="daily-limit" className="input" type="number" min={0} step={1} placeholder="e.g. 20"
                value={draft.daily_limit ?? ""}
                onChange={(e) => setDraft({ ...draft, daily_limit: e.target.value === "" ? null : (e.target.value as unknown as number) })} />
              <p className="mt-1 text-xs text-muted">How many you can make per day. The menu shows &quot;only N left&quot; and marks it sold out at 0. Resets every day.</p>
            </div>
            <OptionGroupsEditor value={draft.option_groups} onChange={(option_groups) => setDraft({ ...draft, option_groups })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-ok" checked={draft.available}
                onChange={(e) => setDraft({ ...draft, available: e.target.checked })} />
              Available to order
            </label>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex gap-2 pt-2">
              {draft.id && <button type="button" className="btn-ghost text-red-600" onClick={remove}>Delete</button>}
              <span className="flex-1" />
              <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
