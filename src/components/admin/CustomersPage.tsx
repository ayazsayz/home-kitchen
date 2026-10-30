"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normalise, roundMoney } from "@/lib/format";
import { useShop } from "@/lib/use-currency";
import { addDays, dateIn, todayIn, timeShort } from "@/lib/tz";
import { whatsappLink } from "@/lib/whatsapp";

type Row = {
  id: string;
  order_no: number;
  customer_name: string;
  customer_phone: string;
  address: string;
  total: number;
  subtotal: number;
  created_at: string;
  promo_code: string | null;
  order_items: { name: string; qty: number }[];
};

type Customer = {
  phone: string;
  name: string;
  address: string;
  orders: Row[];
  count: number;
  spent: number;
  first: string;
  last: string;
  favourite: string;
  rewards: number;
};

type Filter = "all" | "regulars" | "new" | "lapsed";
type Sort = "last" | "spent" | "count";
const MSG_KEY = "hk_customer_msg_v1";
const DEFAULT_MSG = "Hi {name}! 👋 Something new on our menu this week — order here: {menu}";

export default function CustomersPage() {
  const db = useMemo(() => supabaseBrowser(), []);
  const { cur, tz, ready } = useShop();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("last");
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [noteMsg, setNoteMsg] = useState("");
  useEffect(() => {
    db.from("customer_notes").select("phone, note").then(({ data }) => setNotes(Object.fromEntries((data ?? []).map((x) => [x.phone, x.note]))));
  }, [db]);
  async function saveNote(phone: string) {
    const note = noteDraft.trim().slice(0, 200);
    const { data: u } = await db.auth.getUser();
    const { data: me } = await db.from("staff").select("name").eq("user_id", u.user?.id ?? "").maybeSingle();
    const { error } = note
      ? await db.from("customer_notes").upsert({ phone, note, updated_by_name: me?.name ?? "", updated_at: new Date().toISOString() })
      : await db.from("customer_notes").delete().eq("phone", phone);
    if (error) return setNoteMsg(error.message);
    setNotes((cur) => ({ ...cur, [phone]: note }));
    setNoteMsg(note ? "Note saved — it shows on this customer's orders." : "Note removed.");
  }
  const [msg, setMsg] = useState(DEFAULT_MSG);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MSG_KEY);
      if (m) setMsg(m);
    } catch {}
    db.from("orders")
      .select("id, order_no, customer_name, customer_phone, address, total, subtotal, created_at, promo_code, order_items(name, qty)")
      .not("status", "in", "(rejected,pending_payment)")
      .order("created_at", { ascending: false })
      .limit(10000)
      .then(({ data }) => {
        setRows((data ?? []).map((r) => normalise(r) as Row));
        setLoading(false);
      });
  }, [db]);

  const customers = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const r of rows) {
      let c = map.get(r.customer_phone);
      if (!c) {
        // rows are newest first, so the first one seen has the latest name and address
        c = { phone: r.customer_phone, name: r.customer_name, address: r.address, orders: [], count: 0, spent: 0, first: r.created_at, last: r.created_at, favourite: "", rewards: 0 };
        map.set(r.customer_phone, c);
      }
      c.orders.push(r);
      c.count += 1;
      c.spent = roundMoney(c.spent + r.total, 3);
      c.first = r.created_at;
      if (r.promo_code === "LOYALTY") c.rewards += 1;
    }
    for (const c of map.values()) {
      const dishes = new Map<string, number>();
      for (const o of c.orders) for (const i of o.order_items ?? []) dishes.set(i.name, (dishes.get(i.name) ?? 0) + i.qty);
      c.favourite = [...dishes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }
    return [...map.values()];
  }, [rows]);

  const today = ready ? todayIn(tz) : "";
  const cutoff = today ? addDays(today, -30) : "";
  const monthStart = today ? `${today.slice(0, 7)}-01` : "";
  const shown = customers
    .filter((c) => {
      if (filter === "regulars" && c.count < 3) return false;
      if (filter === "new" && c.count !== 1) return false;
      if (filter === "lapsed" && dateIn(c.last, tz) >= cutoff) return false;
      const t = q.trim().toLowerCase();
      return !t || c.name.toLowerCase().includes(t) || c.phone.includes(t.replace(/\s/g, ""));
    })
    .sort((a, b) => (sort === "spent" ? b.spent - a.spent : sort === "count" ? b.count - a.count : b.last.localeCompare(a.last)));

  const stats = {
    total: customers.length,
    repeat: customers.filter((c) => c.count > 1).length,
    avg: customers.length ? roundMoney(customers.reduce((s, c) => s + c.spent, 0) / customers.length, 3) : 0,
    newThisMonth: monthStart ? customers.filter((c) => dateIn(c.first, tz) >= monthStart).length : 0,
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const personal = (c: Customer) => msg.replace(/\{name\}/g, c.name.split(" ")[0] || c.name).replace(/\{menu\}/g, origin);
  const saveMsg = (v: string) => {
    setMsg(v);
    try {
      localStorage.setItem(MSG_KEY, v);
    } catch {}
  };

  async function copyNumbers() {
    await navigator.clipboard?.writeText(shown.map((c) => c.phone).join("\n")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportCsv() {
    const head = ["name", "phone", "orders", "total_spent", "first_order", "last_order", "favourite_dish", "address"];
    const out = shown.map((c) => [c.name, c.phone, c.count, c.spent, dateIn(c.first, tz), dateIn(c.last, tz), c.favourite, c.address]);
    const csv = [head, ...out].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv";
    a.click();
  }

  const daysAgo = (iso: string) => {
    if (!today) return "";
    const d = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateIn(iso, tz)}T00:00:00Z`)) / 86400000);
    return d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-bold">Customers</h1>
        {(
          [
            ["all", "All"],
            ["regulars", "Regulars (3+ orders)"],
            ["new", "Ordered once"],
            ["lapsed", "Not ordered in 30 days"],
          ] as [Filter, string][]
        ).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === k ? "bg-ink text-white" : "border border-line bg-paper"}`}>
            {l}
          </button>
        ))}
        <span className="flex-1" />
        <button className="btn-ghost text-sm" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="customer-stats">
        <Stat label="Customers" value={String(stats.total)} />
        <Stat label="Came back" value={stats.total ? `${Math.round((stats.repeat / stats.total) * 100)}%` : "—"} hint={`${stats.repeat} ordered more than once`} />
        <Stat label="Avg spend / customer" value={money(stats.avg, cur)} />
        <Stat label="New this month" value={String(stats.newThisMonth)} />
      </div>

      <section className="card space-y-2 p-4">
        <label className="label mb-0" htmlFor="cust-msg">WhatsApp message (use {"{name}"} and {"{menu}"})</label>
        <textarea id="cust-msg" className="input text-sm" rows={2} value={msg} onChange={(e) => saveMsg(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>Tap <b>WhatsApp</b> next to a customer to send it to them.</span>
          <button className="text-brand" onClick={copyNumbers}>{copied ? "Copied ✓" : `Copy ${shown.length} number${shown.length === 1 ? "" : "s"}`}</button>
          <span>(paste into a WhatsApp broadcast list)</span>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs py-2" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted">
          Sort
          <select className="rounded-lg border border-line bg-paper px-2 py-1.5" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="last">Most recent</option>
            <option value="spent">Most spent</option>
            <option value="count">Most orders</option>
          </select>
        </label>
        <span className="text-sm text-muted">{shown.length} shown</span>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-2 py-2 text-right font-medium">Orders</th>
              <th className="px-2 py-2 text-right font-medium">Spent</th>
              <th className="px-2 py-2 font-medium">Last order</th>
              <th className="px-2 py-2 font-medium">Favourite</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-4 py-6 text-muted">Loading…</td></tr>}
            {!loading && shown.length === 0 && <tr><td className="px-4 py-6 text-center text-muted" colSpan={6}>No customers here yet.</td></tr>}
            {shown.map((c) => (
              <Fragment key={c.phone}>
                <tr className="cursor-pointer border-t border-line hover:bg-cream/60" onClick={() => { setOpen(open === c.phone ? null : c.phone); setNoteDraft(notes[c.phone] ?? ""); setNoteMsg(""); }}>
                  <td className="px-4 py-2">
                    <div className="font-medium">
                      {c.name}
                      {c.count >= 3 && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">Regular</span>}
                    </div>
                    <div className="text-xs text-muted">{c.phone}</div>
                    {notes[c.phone] && <div className="mt-0.5 text-xs font-medium text-amber-800">📌 {notes[c.phone]}</div>}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold">{c.count}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{money(c.spent, cur)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted">{daysAgo(c.last)}</td>
                  <td className="px-2 py-2 text-muted">{c.favourite}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <a className="mr-3 text-brand" href={`tel:${c.phone}`}>Call</a>
                    <a className="font-medium text-ok" href={whatsappLink(c.phone, personal(c))} target="_blank" rel="noreferrer">WhatsApp</a>
                  </td>
                </tr>
                {open === c.phone && (
                  <tr className="bg-cream/50">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="mb-2 text-xs text-muted">
                        Customer since {dateIn(c.first, tz)}
                        {c.address && <> · {c.address}</>}
                        {c.rewards > 0 && <> · {c.rewards} loyalty reward{c.rewards > 1 ? "s" : ""} used</>}
                      </div>
                      <div className="mb-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input className="input min-w-0 flex-1 py-1.5 text-sm" placeholder="📌 Note about this customer, e.g. allergic to nuts, VIP" maxLength={200}
                          value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} aria-label={`Note for ${c.name}`} />
                        <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => saveNote(c.phone)}>Save note</button>
                        {noteMsg && <span className="text-xs text-ok">{noteMsg}</span>}
                      </div>
                      <ul className="space-y-1">
                        {c.orders.slice(0, 8).map((o) => (
                          <li key={o.id} className="flex gap-3">
                            <a className="w-14 text-brand" href={`/order/${o.id}`} target="_blank" rel="noreferrer">#{o.order_no}</a>
                            <span className="w-28 text-muted">{timeShort(o.created_at, tz)}</span>
                            <span className="flex-1">{(o.order_items ?? []).map((i) => `${i.qty}× ${i.name}`).join(", ")}</span>
                            <span className="whitespace-nowrap">{money(o.total, cur)}</span>
                          </li>
                        ))}
                      </ul>
                      {c.orders.length > 8 && <div className="mt-1 text-xs text-muted">+ {c.orders.length - 8} older orders</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}
