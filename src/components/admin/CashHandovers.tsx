"use client";
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { money, normalise, type Currency } from "@/lib/format";
import { timeShort } from "@/lib/tz";
import { driverBalances, type DriverCash } from "@/lib/cash";
import type { CashHandover } from "@/lib/types";

/** Loads cash collected by drivers (delivered cash orders) and handovers. RLS limits drivers to their own rows. */
function useCash(db: SupabaseClient, refreshKey: unknown, enabled = true) {
  const [balances, setBalances] = useState<DriverCash[]>([]);
  const [history, setHistory] = useState<CashHandover[]>([]);
  const load = useCallback(async () => {
    const [{ data: o }, { data: h }] = await Promise.all([
      db.from("orders").select("driver_id, driver_name, total").eq("order_type", "delivery").eq("status", "completed")
        .neq("payment_status", "paid").not("driver_id", "is", null).limit(10000),
      db.from("cash_handovers").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    const hs = (h ?? []).map((x) => normalise(x) as CashHandover);
    setBalances(driverBalances(o ?? [], hs));
    setHistory(hs);
  }, [db]);
  useEffect(() => {
    if (enabled) load();
  }, [load, refreshKey, enabled]);
  return { balances, history, reload: load };
}

/** Owner/manager: who is holding how much cash, record a handover, see history. */
export function CashPanel({ db, cur, tz, me, refreshKey }: {
  db: SupabaseClient; cur?: Currency; tz?: string; me: { userId: string; name: string }; refreshKey: unknown;
}) {
  const { balances, history, reload } = useCash(db, refreshKey);
  const [open, setOpen] = useState<DriverCash | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    const a = Number(amount);
    if (!(a > 0)) return setMsg("Enter the amount you received");
    setBusy(true);
    const { error } = await db.from("cash_handovers").insert({
      driver_id: open.driverId, driver_name: open.name, amount: a, note: note.trim().slice(0, 200),
      received_by: me.userId || null, received_by_name: me.name,
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    setMsg(`Recorded ${money(a, cur)} from ${open.name}.`);
    setOpen(null);
    reload();
  }

  const holding = balances.filter((b) => b.balance !== 0);
  return (
    <section className="card space-y-3 p-4" data-testid="cash-panel">
      <div>
        <h2 className="font-semibold">Cash with drivers</h2>
        <p className="text-xs text-muted">Cash collected on delivered orders minus what each driver has handed over.</p>
      </div>
      {holding.length === 0 ? (
        <p className="text-sm text-muted">All cash has been handed over.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {holding.map((b) => (
            <li key={b.driverId} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="cash-row">
              <span>
                <b>{b.name || "Driver"}</b>
                <span className="block text-xs text-muted">collected {money(b.collected, cur)} · handed over {money(b.handedOver, cur)}</span>
              </span>
              <span className="flex items-center gap-2">
                <b className={b.balance < 0 ? "text-red-700" : ""}>{money(b.balance, cur)}</b>
                <button className="btn py-1.5 text-sm" onClick={() => { setOpen(b); setAmount(String(Math.max(0, b.balance))); setNote(""); setMsg(""); }}>
                  Received cash
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form onSubmit={save} className="space-y-2 rounded-xl border border-brand/40 bg-brand/5 p-3" data-testid="handover-form">
          <div className="text-sm font-semibold">Cash received from {open.name}</div>
          <div className="flex flex-wrap gap-2">
            <input className="input w-36" type="number" step="any" min="0" inputMode="decimal" value={amount} aria-label="Amount received"
              onChange={(e) => setAmount(e.target.value)} />
            <input className="input min-w-0 flex-1" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          </div>
          <div className="flex gap-2">
            <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(null)}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <p className="text-sm" role="status">{msg}</p>}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Handover history ({history.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {history.slice(0, 30).map((h) => (
              <li key={h.id} className="flex justify-between gap-2 py-1.5">
                <span>{h.driver_name} → {h.received_by_name || "—"}{h.note ? <span className="text-muted"> · {h.note}</span> : null}</span>
                <span className="whitespace-nowrap text-muted">{timeShort(h.created_at, tz)} · <b className="text-ink">{money(h.amount, cur)}</b></span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** Driver: how much cash they're holding, and recent handovers. */
export function useDriverCash(db: SupabaseClient, userId: string, refreshKey: unknown) {
  const { balances, history } = useCash(db, refreshKey, !!userId);
  const mine = balances.find((b) => b.driverId === userId);
  return { balance: mine?.balance ?? 0, history: history.filter((h) => h.driver_id === userId) };
}
