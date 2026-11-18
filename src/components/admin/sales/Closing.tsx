"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { decimalsOf, money, roundMoney } from "@/lib/format";
import { closingFor, CHANNELS, loadExpenses, loadOrders, type DayClosing, type Expense } from "@/lib/sales";
import { addDays, bizEndIso, bizStartIso, bizToday, timeShort } from "@/lib/tz";
import { printReport } from "@/lib/ticket";
import { downloadXlsx, moneyFmt, type Sheet } from "@/lib/xlsx";
import type { Order } from "@/lib/types";
import DailySummaryCard from "../DailySummaryCard";
import { ExportButton, ordersSheet, STATUS, type Shop } from "./shared";

const dayLong = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const noTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /day_closings/.test(e.message ?? ""));

/** End-of-day report for one business day + cash count ("close the day") + past closings. */
export default function Closing({ shop, onSaved }: { shop: Shop; onSaved?: () => void }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const { cur, tz, dayEnd } = shop;
  const today = bizToday(tz, dayEnd);
  const [day, setDay] = useState(today);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [saved, setSaved] = useState<DayClosing | null>(null);
  const [past, setPast] = useState<DayClosing[]>([]);
  const [pastFrom, setPastFrom] = useState(addDays(today, -29));
  const [pastTo, setPastTo] = useState(today);
  const [hasTable, setHasTable] = useState(true);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = { from: day, to: day };
    const [o, e, c] = await Promise.all([
      loadOrders(db, r, tz, dayEnd).catch(() => [] as Order[]),
      loadExpenses(db, r),
      db.from("day_closings").select("*").eq("day", day).maybeSingle(),
    ]);
    setOrders(o);
    setExpenses(e);
    setHasTable(!noTable(c.error));
    const row = c.data ? normal(c.data) : null;
    setSaved(row);
    setCounted(row ? String(row.counted_cash) : "");
    setNote(row?.note ?? "");
    setLoading(false);
  }, [db, day, tz, dayEnd]);
  useEffect(() => {
    load();
    setMsg("");
  }, [load]);

  const loadPast = useCallback(async () => {
    const { data, error } = await db.from("day_closings").select("*").gte("day", pastFrom).lte("day", pastTo).order("day", { ascending: false });
    if (noTable(error)) return setHasTable(false);
    setPast((data ?? []).map(normal));
  }, [db, pastFrom, pastTo]);
  useEffect(() => {
    loadPast();
  }, [loadPast]);

  const c = useMemo(() => closingFor(orders, expenses), [orders, expenses]);
  const countedNum = counted.trim() === "" ? null : Number(counted.replace(/,/g, ""));
  const diff = countedNum === null || !Number.isFinite(countedNum) ? null : roundMoney(countedNum - c.expectedCash, 3);

  async function closeDay() {
    if (countedNum === null || !Number.isFinite(countedNum) || countedNum < 0) return setMsg("Enter the cash you counted in the drawer.");
    setBusy(true);
    const { data: u } = await db.auth.getUser();
    const { data: me } = await db.from("staff").select("name").eq("user_id", u.user?.id ?? "").maybeSingle();
    const { error } = await db.from("day_closings").upsert({
      day, orders: c.orders, net_sales: c.net, expected_cash: c.expectedCash, counted_cash: countedNum, note: note.trim().slice(0, 300),
      closed_by_name: me?.name ?? "", closed_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) return setMsg(noTable(error) ? "Saving closings needs a quick database update (migration 017)." : error.message);
    await Promise.all([load(), loadPast()]);
    onSaved?.();
    setMsg(`Day closed ✓ ${diff === 0 ? "Cash matches." : diff! > 0 ? `Over by ${money(diff!, cur)}.` : `Short by ${money(-diff!, cur)}.`}`);
  }

  const lines: [string, string, "b" | "m" | ""][] = [
    ["Orders", String(c.orders), ""],
    ["Gross sales (food + delivery)", money(c.gross, cur), ""],
    ["− Discounts & promos", money(c.discounts, cur), "m"],
    ["Net sales", money(c.net, cur), "b"],
    ["   of which delivery fees", money(c.fees, cur), "m"],
    ["Card (paid online)", money(c.card, cur), ""],
    ["Cash", money(c.cash, cur), ""],
    ["− Expenses paid in cash", money(c.cashExpenses, cur), "m"],
    ["Cash expected in drawer", money(c.expectedCash, cur), "b"],
    ["Cancelled", `${c.cancelled.length} · ${money(c.cancelledAmount, cur)}`, "m"],
    ["From", (Object.keys(CHANNELS) as (keyof typeof CHANNELS)[]).filter((k) => c.channels[k]).map((k) => `${CHANNELS[k]} ${c.channels[k]}`).join(" · ") || "—", "m"],
    ["Delivery / Pickup", `${c.types.delivery ?? 0} / ${c.types.pickup ?? 0}`, "m"],
  ];

  function print() {
    const esc = (t: string) => t.replace(/[&<>]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[x]!);
    const row = (l: string, v: string, b = false) => `<tr><td>${b ? "<b>" : ""}${esc(l.trim())}${b ? "</b>" : ""}</td><td class="amt">${b ? "<b>" : ""}${esc(v)}${b ? "</b>" : ""}</td></tr>`;
    const count = saved
      ? `<hr/><table>${row("Cash counted", money(saved.counted_cash, cur), true)}${row("Difference", money(saved.difference, cur), true)}</table>${saved.note ? `<div>${esc(saved.note)}</div>` : ""}<div>Closed by ${esc(saved.closed_by_name || "—")} ${timeShort(saved.closed_at, tz)}</div>`
      : "";
    printReport(`Day closing ${day}`, `<div class="big" style="text-align:center">DAY CLOSING</div><div style="text-align:center">${esc(dayLong(day))}</div><hr/>
      <table>${lines.map(([l, v, k]) => row(l, v, k === "b")).join("")}</table>${count}<hr/><div style="text-align:center">Printed ${timeShort(new Date().toISOString(), tz)}</div>`);
  }

  function exportExcel() {
    const m = moneyFmt(decimalsOf(cur));
    const closing: Sheet = {
      name: "Closing",
      rows: [
        ["Day closing", dayLong(day)],
        ["Orders", c.orders],
        ["Gross sales (food + delivery)", c.gross],
        ["Discounts & promos", c.discounts],
        ["Net sales", c.net],
        ["Delivery fees", c.fees],
        ["Card (paid online)", c.card],
        ["Cash", c.cash],
        ["Expenses paid in cash", c.cashExpenses],
        ["Cash expected in drawer", c.expectedCash],
        ["Cash counted", saved?.counted_cash ?? null],
        ["Difference", saved?.difference ?? null],
        ["Note", saved?.note ?? ""],
        ["Closed by", saved ? `${saved.closed_by_name} ${timeShort(saved.closed_at, tz)}` : "not closed yet"],
        ["Cancelled orders", c.cancelled.length],
        ["Cancelled amount", c.cancelledAmount],
      ],
      widths: [30, 22],
      numFmt: [null, m],
      bold: [4, 9],
    };
    const pastSheet: Sheet = {
      name: "Past closings",
      rows: [["Day", "Orders", "Net sales", "Cash expected", "Cash counted", "Difference", "Closed by", "Note"], ...past.map((p) => [p.day, p.orders, p.net_sales, p.expected_cash, p.counted_cash, p.difference, p.closed_by_name, p.note])],
      widths: [12, 8, 14, 14, 14, 12, 14, 36],
      numFmt: [null, "0", m, m, m, m, null, null],
    };
    const exp: Sheet = {
      name: "Expenses",
      rows: [["Category", "Description", "Paid with", "Amount"], ...expenses.map((e) => [e.category, e.description, e.paid_with, e.amount])],
      widths: [16, 36, 10, 14],
      numFmt: [null, null, null, m],
    };
    downloadXlsx(`day-closing-${day}`, [closing, ordersSheet("Orders", orders, shop), exp, pastSheet]);
  }

  return (
    <div className="space-y-5" data-testid="day-closing">
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <button type="button" className="min-h-11 min-w-11 rounded-lg border border-line bg-paper text-lg" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>‹</button>
        <label htmlFor="closing-day" className="text-sm text-muted">Business day</label>
        <input id="closing-day" type="date" className="input !w-auto" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button type="button" className="min-h-11 min-w-11 rounded-lg border border-line bg-paper text-lg disabled:opacity-40" aria-label="Next day" disabled={day >= today} onClick={() => setDay(addDays(day, 1))}>›</button>
        <span className="text-sm text-muted">
          {timeShort(bizStartIso(day, tz, dayEnd), tz)} {dayLong(day).slice(0, 10)} → {timeShort(bizEndIso(day, tz, dayEnd), tz)} next day
        </span>
        <span className="flex-1" />
        {saved && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800" data-testid="closed-badge">
            Closed{saved.closed_by_name ? ` by ${saved.closed_by_name}` : ""} at {timeShort(saved.closed_at, tz)}
          </span>
        )}
        <button type="button" className="btn-ghost min-h-11" onClick={print} disabled={loading}>Print on receipt printer</button>
        <ExportButton onClick={exportExcel} disabled={loading} />
      </div>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{msg}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className="card p-4" data-testid="closing-summary">
            <h2 className="mb-2 font-semibold">Closing summary · {dayLong(day)}</h2>
            <table className="w-full text-sm">
              <tbody>
                {lines.map(([l, v, k]) => (
                  <tr key={l} className={`border-t border-line ${k === "m" ? "text-muted" : ""} ${k === "b" ? "text-base font-bold" : ""}`}>
                    <td className="whitespace-pre py-2">{l}</td>
                    <td className="py-2 text-right">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.otherExpenses > 0 && <p className="mt-2 text-xs text-muted">Card / bank expenses this day: {money(c.otherExpenses, cur)} (not from the drawer).</p>}
          </section>

          <div className="space-y-5">
            <section className="card space-y-3 p-4" data-testid="cash-count">
              <h2 className="font-semibold">Cash count</h2>
              {!hasTable ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Saving the cash count needs a quick database update (migration 017). The report above works already.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-cream p-3">
                      <div className="text-xs text-muted">Cash expected in drawer</div>
                      <div className="text-2xl font-bold">{money(c.expectedCash, cur)}</div>
                    </div>
                    <div>
                      <label htmlFor="cash-counted" className="text-xs text-muted">Cash counted</label>
                      <input id="cash-counted" className="input text-xl font-bold" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  {diff !== null && (
                    <p className={`rounded-xl px-3 py-2 font-semibold ${diff === 0 ? "bg-green-50 text-green-800" : diff > 0 ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-800"}`} data-testid="cash-diff">
                      {diff === 0 ? "Cash matches ✓" : diff > 0 ? `Over by ${money(diff, cur)}` : `Short by ${money(-diff, cur)}`}
                    </p>
                  )}
                  <div>
                    <label htmlFor="closing-note" className="text-xs text-muted">Note (optional)</label>
                    <input id="closing-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. rider kept change for order #1291" />
                  </div>
                  <button type="button" className="btn w-full" onClick={closeDay} disabled={busy}>{saved ? "Update closing" : "Close the day"}</button>
                </>
              )}
            </section>

            <section className="card space-y-2 p-4" data-testid="cancelled-list">
              <h2 className="font-semibold">Cancelled ({c.cancelled.length})</h2>
              {c.cancelled.length === 0 && <p className="text-sm text-muted">None.</p>}
              {c.cancelled.map((o) => (
                <div key={o.id} className="flex justify-between gap-2 border-t border-line pt-2 text-sm">
                  <span>#{o.order_no} · {o.customer_name} · {timeShort(o.created_at, tz)}</span>
                  <b className="whitespace-nowrap">{money(o.total, cur)}</b>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}

      {hasTable && (
        <section className="card overflow-x-auto p-4" data-testid="past-closings">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="me-auto font-semibold">Past closings</h2>
            <label htmlFor="past-from" className="text-sm text-muted">From</label>
            <input id="past-from" type="date" className="input !w-auto !py-1.5" value={pastFrom} onChange={(e) => e.target.value && setPastFrom(e.target.value)} />
            <label htmlFor="past-to" className="text-sm text-muted">to</label>
            <input id="past-to" type="date" className="input !w-auto !py-1.5" value={pastTo} onChange={(e) => e.target.value && setPastTo(e.target.value)} />
          </div>
          {past.length === 0 ? (
            <p className="text-sm text-muted">No days closed in this period yet.</p>
          ) : (
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-medium">Day</th>
                  <th className="py-1 text-right font-medium">Orders</th>
                  <th className="py-1 text-right font-medium">Net sales</th>
                  <th className="py-1 text-right font-medium">Cash expected</th>
                  <th className="py-1 text-right font-medium">Counted</th>
                  <th className="py-1 text-right font-medium">Difference</th>
                  <th className="py-1 ps-3 font-medium">Closed by</th>
                </tr>
              </thead>
              <tbody>
                {past.map((p) => (
                  <tr key={p.day} className="cursor-pointer border-t border-line hover:bg-cream/60" onClick={() => setDay(p.day)}>
                    <td className="py-1.5"><button type="button" className="text-brand">{dayLong(p.day)}</button></td>
                    <td className="py-1.5 text-right">{p.orders}</td>
                    <td className="py-1.5 text-right font-medium">{money(p.net_sales, cur)}</td>
                    <td className="py-1.5 text-right">{money(p.expected_cash, cur)}</td>
                    <td className="py-1.5 text-right">{money(p.counted_cash, cur)}</td>
                    <td className={`py-1.5 text-right font-semibold ${p.difference === 0 ? "text-ok" : p.difference > 0 ? "text-blue-700" : "text-red-700"}`}>
                      {p.difference > 0 ? "+ " : p.difference < 0 ? "− " : ""}{money(Math.abs(p.difference), cur)}
                    </td>
                    <td className="py-1.5 ps-3">{p.closed_by_name || "—"}{p.note ? <span className="block text-xs text-muted">{p.note}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <DailySummaryCard cur={cur} tz={tz} dayEnd={dayEnd} />
      <p className="text-xs text-muted">Statuses counted: {Object.values(STATUS).filter((x) => x !== "Cancelled").join(", ")}. Unpaid card checkouts are left out.</p>
    </div>
  );
}

function normal(r: Record<string, unknown>): DayClosing {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    day: String(r.day),
    orders: n("orders"),
    net_sales: n("net_sales"),
    expected_cash: n("expected_cash"),
    counted_cash: n("counted_cash"),
    difference: roundMoney(n("difference"), 3),
    note: String(r.note ?? ""),
    closed_by_name: String(r.closed_by_name ?? ""),
    closed_at: String(r.closed_at),
  };
}
