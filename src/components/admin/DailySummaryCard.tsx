"use client";
import { useEffect, useState } from "react";
import { money, type Currency } from "@/lib/format";
import { todayIn } from "@/lib/tz";

type Summary = {
  day: string;
  orders: number;
  revenue: number;
  cash: number;
  card: number;
  expenses: number;
  profit: number;
  top: { name: string; qty: number }[];
};

/** "Today's summary" with one-tap sharing on WhatsApp (e.g. to the owner's own chat or family group). */
export default function DailySummaryCard({ cur, tz }: { cur: Currency; tz: string }) {
  const [day, setDay] = useState(() => todayIn(tz));
  const [data, setData] = useState<{ summary: Summary; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setDay(todayIn(tz)), [tz]);
  useEffect(() => {
    setData(null);
    fetch(`/api/admin/summary?date=${day}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [day]);

  const s = data?.summary;
  return (
    <section className="card space-y-3 p-4" data-testid="daily-summary">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">📋 Daily summary</h2>
        <input type="date" className="rounded-lg border border-line bg-paper px-2 py-1 text-sm" value={day} max={todayIn(tz)}
          onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Summary date" />
        <span className="flex-1" />
        {data && (
          <>
            <button className="btn-ghost py-1.5 text-sm" onClick={async () => {
              await navigator.clipboard?.writeText(data.text).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <a className="btn py-1.5 text-sm" href={`https://wa.me/?text=${encodeURIComponent(data.text)}`} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
          </>
        )}
      </div>
      {!s ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <span>Orders <b>{s.orders}</b></span>
          <span>Sales <b>{money(s.revenue, cur)}</b></span>
          <span>Cash {money(s.cash, cur)} · Card {money(s.card, cur)}</span>
          <span>Expenses {money(s.expenses, cur)}</span>
          <span className={s.profit < 0 ? "text-red-700" : "text-ok"}>Profit <b>{money(s.profit, cur)}</b></span>
          <span className="text-muted">{s.top[0] ? `Top: ${s.top[0].name} × ${s.top[0].qty}` : "No orders"}</span>
        </div>
      )}
    </section>
  );
}
