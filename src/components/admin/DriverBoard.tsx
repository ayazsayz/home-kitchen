"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { currencyOf, money, normalise, normaliseOrder, roundMoney } from "@/lib/format";
import { optionsText } from "@/lib/options";
import { mapsLink } from "@/lib/maps";
import { renderMessage, whatsappLink } from "@/lib/whatsapp";
import { dayStartIso, timeShort, todayIn } from "@/lib/tz";
import { withSettingDefaults } from "@/lib/settings";
import type { Role } from "@/lib/roles";
import type { Order, Settings } from "@/lib/types";
import { CashPanel, useDriverCash } from "./CashHandovers";

/**
 * Phone screen for delivery drivers: pick up ready orders, open the map, call/WhatsApp the
 * customer, mark delivered and see how much cash to hand over. Owners/managers see everyone.
 */
export default function DriverBoard({ role, userId, name }: { role: Role; userId: string; name: string }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [tick, setTick] = useState(0); // bumps when orders reload so cash totals refresh
  const isDriver = role === "driver";

  const load = useCallback(async () => {
    const { data: st } = await db.from("settings").select("*").eq("id", 1).single();
    const s = st ? withSettingDefaults(normalise(st)) : null;
    if (s) setSettings(s);
    const since = dayStartIso(todayIn(s?.timezone), s?.timezone);
    // Drivers only receive rows the database allows them to see (ready & unassigned, or theirs).
    const { data } = await db
      .from("orders")
      .select("*, order_items(*)")
      .eq("order_type", "delivery")
      .or(`status.in.(ready,out_for_delivery),and(status.eq.completed,delivered_at.gte.${since})`)
      .order("created_at");
    setOrders((data ?? []).map((o) => normaliseOrder(o) as Order));
    setTick((n) => n + 1);
  }, [db]);

  useEffect(() => {
    load();
    const ch = db
      .channel("driver-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => setTimeout(load, 500))
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => {
      db.removeChannel(ch);
      clearInterval(poll);
    };
  }, [db, load]);

  async function pickUp(o: Order) {
    setBusy(o.id);
    const now = new Date().toISOString();
    const { error } = await db
      .from("orders")
      .update({ driver_id: userId, driver_name: name, status: "out_for_delivery", picked_up_at: now, updated_at: now })
      .eq("id", o.id)
      .eq("status", "ready"); // someone else may have taken it
    setBusy("");
    if (error) alert("Couldn't pick up this order. It may have been taken by another driver.");
    load();
  }

  async function delivered(o: Order) {
    if (!confirm(`Delivered order #${o.order_no}${o.payment_status === "paid" ? "" : ` and collected ${money(o.total, cur)}`}?`)) return;
    setBusy(o.id);
    const now = new Date().toISOString();
    await db.from("orders").update({ status: "completed", delivered_at: now, updated_at: now }).eq("id", o.id);
    setBusy("");
    load();
  }

  const cur = settings ? currencyOf(settings) : undefined;
  const tz = settings?.timezone;
  const mine = (o: Order) => o.driver_id === userId;
  const ready = orders.filter((o) => o.status === "ready" && (!o.driver_id || mine(o) || !isDriver));
  const onTheWay = orders.filter((o) => o.status === "out_for_delivery" && (isDriver ? mine(o) : true));
  const done = orders.filter((o) => o.status === "completed" && (isDriver ? mine(o) : true));
  const cashOf = (list: Order[]) => roundMoney(list.filter((o) => o.payment_status !== "paid").reduce((s, o) => s + o.total, 0), 3);
  const myCash = useDriverCash(db, isDriver ? userId : "", isDriver ? tick : -1);

  // Owner/manager: per-driver totals for today.
  const byDriver = new Map<string, { name: string; delivered: number; cash: number; onTheWay: number }>();
  if (!isDriver) {
    for (const o of [...done, ...onTheWay]) {
      const k = o.driver_id || "—";
      const e = byDriver.get(k) ?? { name: o.driver_name || "No driver", delivered: 0, cash: 0, onTheWay: 0 };
      if (o.status === "completed") {
        e.delivered += 1;
        if (o.payment_status !== "paid") e.cash = roundMoney(e.cash + o.total, 3);
      } else e.onTheWay += 1;
      byDriver.set(k, e);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deliveries</h1>
        <button className="btn-ghost py-1.5 text-sm" onClick={load}>Refresh</button>
      </div>

      {isDriver ? (
        <div className="grid grid-cols-2 gap-3" data-testid="driver-today">
          <div className="card p-4">
            <div className="text-sm text-muted">Delivered today</div>
            <div className="mt-1 text-2xl font-bold">{done.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-muted">Cash to hand over</div>
            <div className="mt-1 text-2xl font-bold" data-testid="driver-balance">{money(myCash.balance, cur)}</div>
            <div className="text-xs text-muted">today {money(cashOf(done), cur)}</div>
          </div>
          {myCash.history.length > 0 && (
            <div className="card col-span-2 p-4 text-sm" data-testid="driver-handovers">
              <div className="mb-1 font-semibold">Handed over</div>
              <ul className="divide-y divide-line">
                {myCash.history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex justify-between gap-2 py-1">
                    <span>{timeShort(h.created_at, tz)} · to {h.received_by_name || "—"}{h.note ? ` · ${h.note}` : ""}</span>
                    <b>{money(h.amount, cur)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <section className="card overflow-x-auto p-4" data-testid="drivers-today">
          <h2 className="mb-2 font-semibold">Drivers today</h2>
          {byDriver.size === 0 ? (
            <p className="text-sm text-muted">No deliveries yet today.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr><th className="py-1 font-medium">Driver</th><th className="py-1 text-right font-medium">On the way</th><th className="py-1 text-right font-medium">Delivered</th><th className="py-1 text-right font-medium">Cash collected</th></tr>
              </thead>
              <tbody>
                {[...byDriver.values()].map((d) => (
                  <tr key={d.name} className="border-t border-line">
                    <td className="py-1.5">{d.name}</td>
                    <td className="py-1.5 text-right">{d.onTheWay}</td>
                    <td className="py-1.5 text-right">{d.delivered}</td>
                    <td className="py-1.5 text-right font-semibold">{money(d.cash, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!isDriver && <CashPanel db={db} cur={cur} tz={tz} me={{ userId, name }} refreshKey={tick} />}

      <Section title={`On the way (${onTheWay.length})`}>
        {onTheWay.length === 0 && <Empty>Nothing on the way.</Empty>}
        {onTheWay.map((o) => (
          <Card key={o.id} o={o} cur={cur} tz={tz} showDriver={!isDriver}>
            <div className="flex flex-wrap gap-2">
              {mapsLink(o) ? (
                <a className="btn flex-1" href={mapsLink(o)} target="_blank" rel="noreferrer">📍 Map</a>
              ) : (
                <a className="btn-ghost flex-1" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`} target="_blank" rel="noreferrer">📍 Search address</a>
              )}
              <a className="btn-ghost" href={`tel:${o.customer_phone}`}>📞 Call</a>
              {settings && (
                <a className="btn-ghost" target="_blank" rel="noreferrer"
                  href={whatsappLink(o.customer_phone, renderMessage("out_for_delivery", o, settings, window.location.origin))}>
                  💬 WhatsApp
                </a>
              )}
            </div>
            {(mine(o) || !isDriver) && (
              <button className="btn mt-2 w-full bg-ok py-3 hover:bg-ok/90" disabled={busy === o.id} onClick={() => delivered(o)}>
                ✓ Delivered{o.payment_status === "paid" ? "" : ` · collected ${money(o.total, cur)}`}
              </button>
            )}
          </Card>
        ))}
      </Section>

      <Section title={`Ready to pick up (${ready.length})`}>
        {ready.length === 0 && <Empty>No orders waiting. New ones appear here when the kitchen marks them ready.</Empty>}
        {ready.map((o) => (
          <Card key={o.id} o={o} cur={cur} tz={tz} showDriver={!isDriver}>
            <button className="btn w-full py-3" disabled={busy === o.id} onClick={() => pickUp(o)}>
              {o.driver_id && !mine(o) ? `Take over from ${o.driver_name}` : "🛵 Pick up"}
            </button>
          </Card>
        ))}
      </Section>

      <Section title={`Delivered today (${done.length})`}>
        {done.length === 0 && <Empty>None yet.</Empty>}
        <ul className="card divide-y divide-line text-sm">
          {done.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span>#{o.order_no} · {o.customer_name}{!isDriver && o.driver_name ? ` · ${o.driver_name}` : ""}</span>
              <span className="whitespace-nowrap text-muted">
                {o.delivered_at ? timeShort(o.delivered_at, tz) : ""} · {o.payment_status === "paid" ? "paid" : money(o.total, cur)}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;

function Card({ o, cur, tz, showDriver, children }: {
  o: Order; cur?: ReturnType<typeof currencyOf>; tz?: string; showDriver: boolean; children: React.ReactNode;
}) {
  return (
    <article className="card space-y-3 p-4" data-testid={`delivery-${o.order_no}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold">#{o.order_no} · {o.customer_name}</div>
          <div className="text-sm text-muted">
            {o.zone_name && <>{o.zone_name} · </>}{timeShort(o.created_at, tz)}
            {showDriver && o.driver_name && <> · 🛵 {o.driver_name}</>}
          </div>
        </div>
        <div className={`whitespace-nowrap rounded-lg px-2 py-1 text-sm font-bold ${o.payment_status === "paid" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
          {o.payment_status === "paid" ? "PAID" : `Collect ${money(o.total, cur)}`}
        </div>
      </header>
      <p className="text-sm">{o.address}</p>
      {o.notes && <p className="rounded-lg bg-amber-50 px-2 py-1 text-sm">📝 {o.notes}</p>}
      <ul className="text-sm text-muted">
        {o.order_items?.map((i) => (
          <li key={i.id}>{i.qty}× {i.name}{i.options?.length ? ` (${optionsText(i.options)})` : ""}</li>
        ))}
      </ul>
      {children}
    </article>
  );
}
