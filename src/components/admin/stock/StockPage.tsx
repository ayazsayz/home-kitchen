"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { currencyOf, normalise, type Currency } from "@/lib/format";
import { withSettingDefaults } from "@/lib/settings";
import type { Purchase, Settings, StockItem, StockMove, Supplier, SupplierPayment } from "@/lib/types";
import StockTab from "./StockTab";
import PurchasesTab from "./PurchasesTab";
import SuppliersTab from "./SuppliersTab";

export type InvData = {
  items: StockItem[];
  moves: StockMove[];
  suppliers: Supplier[];
  purchases: Purchase[];
  payments: SupplierPayment[];
  settings: Settings;
  cur: Currency;
  me: string;
};
export type InvProps = { data: InvData; reload: () => Promise<void>; go: (tab: Tab, opts?: { newPurchase?: { supplierId?: string; itemIds?: string[] } }) => void };

type Tab = "stock" | "purchases" | "suppliers";
const TABS: [Tab, string][] = [["stock", "📦 Stock"], ["purchases", "🧾 Purchases"], ["suppliers", "🚚 Suppliers"]];

/** Inventory: stock levels, purchases from suppliers, and what we owe them. */
export default function StockPage() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [data, setData] = useState<InvData | null>(null);
  const [tab, setTab] = useState<Tab>("stock");
  const [draft, setDraft] = useState<{ supplierId?: string; itemIds?: string[] } | null>(null);

  const reload = useCallback(async () => {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    const [it, mv, su, pu, pa, st, u] = await Promise.all([
      db.from("stock_items").select("*").order("sort").order("name"),
      db.from("stock_moves").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      db.from("suppliers").select("*").order("name"),
      db.from("purchases").select("*, purchase_lines(*)").order("created_at", { ascending: false }).limit(500),
      db.from("supplier_payments").select("*").order("paid_on", { ascending: false }).limit(2000),
      db.from("settings").select("*").eq("id", 1).single(),
      db.auth.getUser(),
    ]);
    const { data: me } = await db.from("staff").select("name").eq("user_id", u.data.user?.id ?? "").maybeSingle();
    const settings = withSettingDefaults(normalise(st.data ?? {}));
    setData({
      items: (it.data ?? []).map((x) => normalise(x) as StockItem),
      moves: (mv.data ?? []).map((x) => normalise(x) as StockMove),
      suppliers: (su.data ?? []) as Supplier[],
      purchases: (pu.data ?? []).map((p) => ({ ...normalise(p), purchase_lines: (p.purchase_lines ?? []).map((l: object) => normalise(l)) }) as Purchase),
      payments: (pa.data ?? []).map((x) => normalise(x) as SupplierPayment),
      settings,
      cur: currencyOf(settings),
      me: me?.name ?? "",
    });
  }, [db]);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (h === "purchases" || h === "suppliers" || h === "stock") setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const go: InvProps["go"] = (t, opts) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
    if (opts?.newPurchase) setDraft(opts.newPurchase);
  };

  if (!data) return <p className="text-muted">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="me-2 text-2xl font-bold">Stock</h1>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => go(k)} data-tab={k} aria-pressed={tab === k}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-ink text-white" : "border border-line bg-paper"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "stock" && <StockTab data={data} reload={reload} go={go} />}
      {tab === "purchases" && <PurchasesTab data={data} reload={reload} go={go} draft={draft} clearDraft={() => setDraft(null)} />}
      {tab === "suppliers" && <SuppliersTab data={data} reload={reload} go={go} />}
    </div>
  );
}
