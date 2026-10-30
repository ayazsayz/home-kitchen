"use client";
import { IMAGE_SIZES, shrinkImage } from "@/lib/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { currencyOf, money, normalise, roundMoney, type Currency } from "@/lib/format";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/settings";
import { DEFAULT_TZ, addDays, dayEndIso, dayStartIso, todayIn, validTz } from "@/lib/tz";
import type { Expense, ExpensePaidWith, Order } from "@/lib/types";

// ---------- Calendar helpers (shop time zone) ----------
let SHOP_TZ = DEFAULT_TZ; // set from settings on load
const today = () => todayIn(SHOP_TZ);
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;
const startIso = (ymd: string) => dayStartIso(ymd, SHOP_TZ);
const endIso = (ymd: string) => dayEndIso(ymd, SHOP_TZ);
const fmtDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

type RangeKey = "today" | "7" | "month" | "last" | "custom";
function rangeFor(k: RangeKey, custom: { from: string; to: string }) {
  const t = today();
  if (k === "today") return { from: t, to: t };
  if (k === "7") return { from: addDays(t, -6), to: t };
  if (k === "month") return { from: monthStart(t), to: t };
  if (k === "last") {
    const lastEnd = addDays(monthStart(t), -1);
    return { from: monthStart(lastEnd), to: lastEnd };
  }
  return custom;
}

type Draft = {
  id?: string;
  spent_on: string;
  category: string;
  amount: string;
  vendor: string;
  description: string;
  paid_with: ExpensePaidWith;
  receipt_path: string | null;
  file: File | null;
};
const emptyDraft = (category: string): Draft => ({
  spent_on: today(), category, amount: "", vendor: "", description: "", paid_with: "cash", receipt_path: null, file: null,
});

export default function ExpensesPage() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [cur, setCur] = useState<Currency>({ code: "AED", symbol: "AED", decimals: 2 });
  const [categories, setCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [custom, setCustom] = useState({ from: monthStart(today()), to: today() });
  const [catFilter, setCatFilter] = useState<string>("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<Pick<Order, "total" | "payment_status">[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft("Meat"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingCats, setEditingCats] = useState<string | null>(null);
  const [tz, setTz] = useState<string | null>(null); // shop time zone; data loads once it's known
  const [fileKey, setFileKey] = useState(0); // resets the file picker after each save

  const range = rangeFor(rangeKey, custom);

  useEffect(() => {
    db.from("settings").select("*").eq("id", 1).single().then(({ data }) => {
      if (!data) return;
      setCur(currencyOf(data));
      SHOP_TZ = validTz(data.timezone);
      setTz(SHOP_TZ);
      const cats = Array.isArray(data.expense_categories) && data.expense_categories.length ? data.expense_categories : DEFAULT_EXPENSE_CATEGORIES;
      setCategories(cats);
      setDraft((d) => (d.amount ? d : { ...d, category: cats[0], spent_on: today() }));
      setCustom({ from: monthStart(today()), to: today() });
    });
  }, [db]);

  const load = useCallback(async () => {
    if (!tz) return;
    const [e, o] = await Promise.all([
      db.from("expenses").select("*").gte("spent_on", range.from).lte("spent_on", range.to)
        .order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
      db.from("orders").select("total, payment_status").gte("created_at", startIso(range.from)).lt("created_at", endIso(range.to))
        .not("status", "in", "(rejected,pending_payment)"),
    ]);
    setExpenses((e.data ?? []).map((x) => normalise(x) as Expense));
    setOrders((o.data ?? []).map((x) => normalise(x) as Pick<Order, "total" | "payment_status">));
  }, [db, range.from, range.to, tz]);
  useEffect(() => {
    load();
  }, [load]);

  const shown = catFilter ? expenses.filter((x) => x.category === catFilter) : expenses;
  const stats = useMemo(() => {
    const r = (n: number) => roundMoney(n, 3);
    const sales = r(orders.reduce((s, o) => s + o.total, 0));
    const cardSales = r(orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0));
    const spent = r(expenses.reduce((s, x) => s + x.amount, 0));
    const cashSpent = r(expenses.filter((x) => x.paid_with === "cash").reduce((s, x) => s + x.amount, 0));
    const byCat = new Map<string, number>();
    for (const x of expenses) byCat.set(x.category, r((byCat.get(x.category) ?? 0) + x.amount));
    return {
      sales,
      spent,
      profit: r(sales - spent),
      margin: sales > 0 ? Math.round(((sales - spent) / sales) * 100) : null,
      cashInHand: r(sales - cardSales - cashSpent),
      byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [orders, expenses]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(draft.amount);
    if (!(amount > 0)) return setMsg("Enter the amount");
    setBusy(true);
    setMsg("");
    let receipt_path = draft.receipt_path;
    if (draft.file) {
      const file = await shrinkImage(draft.file, IMAGE_SIZES.receipt, { quality: 0.8 });
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${draft.spent_on.slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from("receipts").upload(path, file, { contentType: file.type });
      if (up.error) {
        setBusy(false);
        return setMsg(`Receipt upload failed: ${up.error.message}`);
      }
      receipt_path = path;
    }
    const row = {
      spent_on: draft.spent_on,
      category: draft.category,
      amount: roundMoney(amount, cur.decimals ?? 2),
      vendor: draft.vendor.trim(),
      description: draft.description.trim(),
      paid_with: draft.paid_with,
      receipt_path,
    };
    const { error } = draft.id
      ? await db.from("expenses").update(row).eq("id", draft.id)
      : await db.from("expenses").insert(row);
    setBusy(false);
    if (error) return setMsg(error.message);
    setMsg(draft.id ? "Updated" : `Added ${money(row.amount, cur)} · ${row.category}`);
    // Keep date, category and payment method for fast entry of the next one.
    setDraft({ ...emptyDraft(draft.category), spent_on: draft.spent_on, paid_with: draft.paid_with });
    setFileKey((k) => k + 1);
    load();
  }

  function edit(x: Expense) {
    setMsg("");
    setDraft({
      id: x.id, spent_on: x.spent_on, category: x.category, amount: String(x.amount), vendor: x.vendor,
      description: x.description, paid_with: x.paid_with, receipt_path: x.receipt_path, file: null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(x: Expense) {
    if (!confirm(`Delete ${money(x.amount, cur)} · ${x.category}?`)) return;
    await db.from("expenses").delete().eq("id", x.id);
    if (x.receipt_path) await db.storage.from("receipts").remove([x.receipt_path]);
    if (draft.id === x.id) setDraft(emptyDraft(draft.category));
    load();
  }

  async function openReceipt(path: string) {
    const { data } = await db.storage.from("receipts").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function saveCategories() {
    const list = [...new Set((editingCats ?? "").split("\n").map((x) => x.trim()).filter(Boolean))].slice(0, 40);
    if (!list.length) return;
    await db.from("settings").update({ expense_categories: list }).eq("id", 1);
    setCategories(list);
    if (!list.includes(draft.category)) setDraft((d) => ({ ...d, category: list[0] }));
    setEditingCats(null);
  }

  function exportCsv() {
    const head = ["date", "category", "description", "vendor", "paid_with", "amount"];
    const rows = shown.map((x) => [x.spent_on, x.category, x.description, x.vendor, x.paid_with, x.amount]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `expenses-${range.from}-to-${range.to}.csv`;
    a.click();
  }

  const maxCat = Math.max(1, ...stats.byCat.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Expenses</h1>
        {(
          [
            ["today", "Today"],
            ["7", "Last 7 days"],
            ["month", "This month"],
            ["last", "Last month"],
            ["custom", "Custom"],
          ] as [RangeKey, string][]
        ).map(([k, l]) => (
          <button key={k} onClick={() => setRangeKey(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${rangeKey === k ? "bg-ink text-white" : "border border-line bg-paper"}`}>
            {l}
          </button>
        ))}
        {rangeKey === "custom" && (
          <span className="flex items-center gap-1 text-sm">
            <input type="date" className="rounded-lg border border-line bg-paper px-2 py-1" value={custom.from} aria-label="From"
              onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            –
            <input type="date" className="rounded-lg border border-line bg-paper px-2 py-1" value={custom.to} aria-label="To"
              onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </span>
        )}
        <span className="flex-1" />
        <button className="btn-ghost text-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>

      {/* ---------- Profit summary ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="pnl">
        <Stat label="Sales" value={money(stats.sales, cur)} />
        <Stat label="Expenses" value={money(stats.spent, cur)} />
        <Stat
          label={stats.margin != null ? `Profit · ${stats.margin}%` : "Profit"}
          value={money(stats.profit, cur)}
          tone={stats.profit < 0 ? "text-red-700" : "text-ok"}
        />
        <Stat label="Cash in hand" value={money(stats.cashInHand, cur)} hint="cash sales − cash expenses" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* ---------- Add / edit ---------- */}
        <form onSubmit={save} className="card h-fit space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{draft.id ? "Edit expense" : "Add expense"}</h2>
            <button type="button" className="text-xs text-muted" onClick={() => setEditingCats(categories.join("\n"))}>Edit categories</button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
            {categories.map((cat) => (
              <button type="button" key={cat} role="radio" aria-checked={draft.category === cat} onClick={() => setDraft({ ...draft, category: cat })}
                className={`rounded-full border px-2.5 py-1 text-sm ${draft.category === cat ? "border-brand bg-brand/10 font-medium text-brand-dark" : "border-line"}`}>
                {cat}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exp-amount">Amount ({cur.code})</label>
              <input id="exp-amount" className="input text-lg font-semibold" type="number" inputMode="decimal" min={0} step="any" required
                value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="exp-date">Date</label>
              <input id="exp-date" className="input" type="date" required max={today()} value={draft.spent_on}
                onChange={(e) => setDraft({ ...draft, spent_on: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="exp-desc">What (optional)</label>
            <input id="exp-desc" className="input" placeholder="e.g. 10 kg chicken, 200 burger boxes" value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="exp-vendor">Shop / supplier (optional)</label>
            <input id="exp-vendor" className="input" list="vendors" placeholder="e.g. Al Mina meat market" value={draft.vendor}
              onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
            <datalist id="vendors">
              {[...new Set(expenses.map((x) => x.vendor).filter(Boolean))].map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(["cash", "card", "bank"] as ExpensePaidWith[]).map((p) => (
              <button type="button" key={p} onClick={() => setDraft({ ...draft, paid_with: p })}
                className={`rounded-xl border px-2 py-2 text-sm font-medium capitalize ${draft.paid_with === p ? "border-brand bg-brand/10 text-brand-dark" : "border-line"}`}>
                {p === "bank" ? "Bank transfer" : p}
              </button>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="exp-receipt">Receipt photo (optional)</label>
            <input key={fileKey} id="exp-receipt" type="file" accept="image/*,application/pdf" className="text-sm"
              onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })} />
            {draft.receipt_path && !draft.file && (
              <button type="button" className="ml-2 text-sm text-brand" onClick={() => openReceipt(draft.receipt_path!)}>View current</button>
            )}
          </div>
          {msg && <p className={`text-sm ${/fail|Enter|error/i.test(msg) ? "text-red-700" : "text-ok"}`}>{msg}</p>}
          <div className="flex gap-2">
            {draft.id && (
              <button type="button" className="btn-ghost" onClick={() => setDraft(emptyDraft(draft.category))}>Cancel</button>
            )}
            <button className="btn flex-1" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add expense"}</button>
          </div>
        </form>

        <div className="space-y-5">
          {/* ---------- By category ---------- */}
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">By category</h2>
            {stats.byCat.length === 0 && <p className="text-sm text-muted">No expenses in this period.</p>}
            <ul className="space-y-2 text-sm">
              {stats.byCat.map(([cat, v]) => (
                <li key={cat}>
                  <button className="grid w-full grid-cols-[8rem_1fr_7rem] items-center gap-3 text-left" onClick={() => setCatFilter(catFilter === cat ? "" : cat)}>
                    <span className={catFilter === cat ? "font-semibold text-brand-dark" : ""}>{cat}</span>
                    <span className="h-2.5 rounded-full bg-brand/80" style={{ width: `${(v / maxCat) * 100}%` }} />
                    <span className="text-right">
                      {money(v, cur)} <span className="text-muted">{stats.spent ? Math.round((v / stats.spent) * 100) : 0}%</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------- List ---------- */}
          <section className="card overflow-x-auto">
            <div className="flex items-center justify-between px-4 pt-3">
              <h2 className="font-semibold">
                {catFilter ? `${catFilter} ` : "All "}expenses <span className="font-normal text-muted">({shown.length})</span>
              </h2>
              {catFilter && <button className="text-sm text-muted" onClick={() => setCatFilter("")}>Show all</button>}
            </div>
            <table className="mt-2 w-full min-w-[36rem] text-sm">
              <tbody>
                {shown.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-muted">Nothing here yet.</td></tr>
                )}
                {shown.map((x) => (
                  <tr key={x.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{fmtDate(x.spent_on)}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{x.category}</div>
                      <div className="text-xs text-muted">{[x.description, x.vendor].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-2 py-2 text-xs capitalize text-muted">{x.paid_with}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{money(x.amount, cur)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {x.receipt_path && (
                        <button className="mr-2 text-brand" title="View receipt" onClick={() => openReceipt(x.receipt_path!)}>🧾</button>
                      )}
                      <button className="mr-2 text-muted" onClick={() => edit(x)}>Edit</button>
                      <button className="text-red-600" onClick={() => remove(x)} aria-label="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      {editingCats !== null && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" onClick={() => setEditingCats(null)}>
          <div className="card w-full max-w-sm space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Expense categories</h2>
            <p className="text-sm text-muted">One per line. Past expenses keep their category.</p>
            <textarea className="input font-mono text-sm" rows={12} value={editingCats} onChange={(e) => setEditingCats(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditingCats(null)}>Cancel</button>
              <button className="btn" onClick={saveCategories}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone ?? ""}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
