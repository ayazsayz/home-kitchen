"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useShop } from "@/lib/use-currency";
import { bizToday } from "@/lib/tz";
import { loadExpenses, loadOrders, presetRange, previousRange, PRESETS, type Expense, type PresetKey, type Range } from "@/lib/sales";
import type { Order } from "@/lib/types";
import Overview from "./Overview";
import Closing from "./Closing";
import OrdersSearch from "./OrdersSearch";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "closing", label: "Day closing" },
  { key: "orders", label: "Search orders" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export type SalesData = {
  range: Range;
  prevRange: Range;
  orders: Order[];
  prevOrders: Order[];
  expenses: Expense[];
  prevExpenses: Expense[];
  costs: Record<string, number | null>;
  compare: boolean;
  loading: boolean;
  error: string;
};

/** Sales: Overview (the 360° view), Day closing (cash count), Search orders — each exports to Excel. */
export default function SalesDashboard() {
  const db = useMemo(() => supabaseBrowser(), []);
  const shop = useShop();
  const { tz, dayEnd, ready } = shop;
  const [tab, setTab] = useState<Tab>("overview");
  const [preset, setPreset] = useState<PresetKey | "custom">("today");
  const [range, setRange] = useState<Range | null>(null);
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState<Omit<SalesData, "compare">>({
    range: { from: "", to: "" }, prevRange: { from: "", to: "" }, orders: [], prevOrders: [], expenses: [], prevExpenses: [], costs: {}, loading: true, error: "",
  });
  const [reload, setReload] = useState(0);

  // tab from the address (#closing), so it can be bookmarked
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.key === h)) setTab(h as Tab);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    history.replaceState(null, "", t === "overview" ? window.location.pathname : `#${t}`);
  };

  const today = ready ? bizToday(tz, dayEnd) : "";
  useEffect(() => {
    if (ready && !range) setRange(presetRange("today", bizToday(tz, dayEnd)));
  }, [ready, range, tz, dayEnd]);

  const [costs, setCosts] = useState<Record<string, number | null>>({});
  useEffect(() => {
    db.from("menu_items").select("id, cost").then(({ data }) =>
      setCosts(Object.fromEntries((data ?? []).map((m) => [m.id, m.cost == null ? null : Number(m.cost)]))),
    );
  }, [db]);

  useEffect(() => {
    if (!ready || !range || range.from > range.to) return;
    let gone = false;
    const prev = previousRange(range);
    setData((d) => ({ ...d, loading: true, error: "" }));
    Promise.all([loadOrders(db, range, tz, dayEnd), loadOrders(db, prev, tz, dayEnd), loadExpenses(db, range), loadExpenses(db, prev)])
      .then(([orders, prevOrders, expenses, prevExpenses]) => {
        if (!gone) setData({ range, prevRange: prev, orders, prevOrders, expenses, prevExpenses, costs: {}, loading: false, error: "" });
      })
      .catch((e) => !gone && setData((d) => ({ ...d, loading: false, error: e?.message || "Could not load sales" })));
    return () => {
      gone = true;
    };
  }, [db, range, tz, dayEnd, ready, reload]);

  const pick = (k: PresetKey) => {
    setPreset(k);
    setRange(presetRange(k, today));
  };
  const setFrom = (v: string) => v && range && (setPreset("custom"), setRange({ from: v, to: v > range.to ? v : range.to }));
  const setTo = (v: string) => v && range && (setPreset("custom"), setRange({ from: v < range.from ? v : range.from, to: v }));

  const sales: SalesData = { ...data, costs, compare };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          {ready && (
            <p className="text-sm text-muted">
              {dayEnd ? `Business day ends ${dayEnd}:00 AM` : "Days run midnight to midnight"} · {shop.cur.code}
            </p>
          )}
        </div>
        <a href="/admin/expenses" className="text-sm text-brand">Expenses →</a>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="Sales sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => go(t.key)} aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-[3px] px-4 py-2.5 text-sm font-semibold ${tab === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== "closing" && range && (
        <div className="card flex flex-wrap items-center gap-2 p-3" data-testid="date-filter">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => pick(p.key)}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium ${preset === p.key ? "bg-ink text-white" : "border border-line bg-paper"}`}>
              {p.label}
            </button>
          ))}
          <span className="flex flex-wrap items-center gap-1.5">
            <label htmlFor="sales-from" className="text-sm text-muted">From</label>
            <input id="sales-from" type="date" className="input !w-auto !py-1.5" value={range.from} max={today} onChange={(e) => setFrom(e.target.value)} />
            <label htmlFor="sales-to" className="text-sm text-muted">to</label>
            <input id="sales-to" type="date" className="input !w-auto !py-1.5" value={range.to} max={today} onChange={(e) => setTo(e.target.value)} />
          </span>
          {tab === "overview" && (
            <label className="ms-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-4 w-4" />
              Compare with the {range.from === range.to ? "day" : "same number of days"} before
            </label>
          )}
        </div>
      )}

      {data.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{data.error}</p>}

      {tab === "overview" && ready && data.range.from && <Overview shop={shop} s={sales} />}
      {tab !== "closing" && !data.range.from && <p className="text-muted">Loading…</p>}
      {tab === "closing" && ready && <Closing shop={shop} onSaved={() => setReload((n) => n + 1)} />}
      {tab === "orders" && ready && data.range.from && <OrdersSearch shop={shop} s={sales} />}
    </div>
  );
}
