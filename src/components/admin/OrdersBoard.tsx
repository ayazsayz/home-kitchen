"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normalise, normaliseOrder, timeShort } from "@/lib/format";
import { printOrder, type PrintMode } from "@/lib/ticket";
import { optionsText } from "@/lib/options";
import { NOTIFY_STATUSES, renderMessage, whatsappLink } from "@/lib/whatsapp";
import { STATUS_LABEL, type Order, type OrderStatus, type Settings } from "@/lib/types";

const PRINTER_KEY = "hk_printer_v1";
const WA_KEY = "hk_whatsapp_v1";
type PrinterPref = { enabled: boolean; mode: PrintMode };

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: "accepted", label: "Accept" },
  accepted: { to: "preparing", label: "Start cooking" },
  preparing: { to: "ready", label: "Mark ready" },
};

type Tab = "active" | "done" | "rejected";

export default function OrdersBoard() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [printer, setPrinter] = useState<PrinterPref>({ enabled: false, mode: "both" });
  const [soundOn, setSoundOn] = useState(false);
  const [live, setLive] = useState(false);
  const [waAuto, setWaAuto] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const known = useRef<Set<string>>(new Set());
  const printerRef = useRef(printer);
  printerRef.current = printer;

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PRINTER_KEY) || "null");
      if (p) setPrinter(p);
      setWaAuto(localStorage.getItem(WA_KEY) === "1");
    } catch {}
  }, []);
  const saveWaAuto = (v: boolean) => {
    setWaAuto(v);
    try {
      localStorage.setItem(WA_KEY, v ? "1" : "0");
    } catch {}
  };
  const waLink = (o: Order, status: OrderStatus) =>
    settings ? whatsappLink(o.customer_phone, renderMessage(status, o, settings, window.location.origin)) : "#";
  const savePrinter = (p: PrinterPref) => {
    setPrinter(p);
    try {
      localStorage.setItem(PRINTER_KEY, JSON.stringify(p));
    } catch {}
  };

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  }, []);

  /** Claims the order for printing so only one device prints it. */
  const autoPrint = useCallback(
    async (o: Order, s: Settings) => {
      const pref = printerRef.current;
      if (!pref.enabled || o.printed_at || o.status !== "new") return;
      const { data } = await db
        .from("orders")
        .update({ printed_at: new Date().toISOString() })
        .eq("id", o.id)
        .is("printed_at", null)
        .select("id");
      if (data?.length) await printOrder(o, s, pref.mode);
    },
    [db],
  );

  const load = useCallback(
    async (opts?: { notify?: boolean }) => {
      const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const [{ data: rows }, { data: st }] = await Promise.all([
        db
          .from("orders")
          .select("*, order_items(*)")
          .or(`created_at.gte.${since},status.in.(new,accepted,preparing,ready,out_for_delivery)`)
          .neq("status", "pending_payment") // unpaid card orders stay hidden until paid
          .order("created_at", { ascending: false })
          .limit(300),
        db.from("settings").select("*").eq("id", 1).single(),
      ]);
      if (!rows || !st) return;
      const s = normalise(st) as Settings;
      const list = rows.map((r) => normaliseOrder(r) as Order);
      setSettings(s);
      setOrders(list);

      const fresh = list.filter((o) => !known.current.has(o.id));
      const firstLoad = known.current.size === 0;
      list.forEach((o) => known.current.add(o.id));

      if (opts?.notify && !firstLoad && fresh.some((o) => o.status === "new")) beep();
      // Print anything new that hasn't been printed (also catches orders placed while this screen was closed).
      for (const o of [...list].reverse()) {
        if (o.status === "new" && !o.printed_at && Date.now() - +new Date(o.created_at) < 3 * 3600 * 1000) {
          await autoPrint(o, s);
        }
      }
    },
    [db, beep, autoPrint],
  );

  useEffect(() => {
    load();
    const ch = db
      .channel("orders-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        // Items are inserted right after the order row; wait a moment so they are included.
        setTimeout(() => load({ notify: true }), 800);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(() => load({ notify: true }), 30000); // safety net if realtime drops
    return () => {
      db.removeChannel(ch);
      clearInterval(poll);
    };
  }, [db, load]);

  async function setStatus(o: Order, status: OrderStatus) {
    // Must open synchronously inside the click, or the browser blocks the popup.
    if (waAuto && NOTIFY_STATUSES.includes(status)) window.open(waLink(o, status), "_blank", "noopener");
    setOrders((cur) => cur.map((x) => (x.id === o.id ? { ...x, status } : x)));
    await db.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", o.id);
  }

  function enableSound() {
    audio.current = audio.current ?? new AudioContext();
    audio.current.resume();
    setSoundOn(true);
    beep();
  }

  const shown = orders.filter((o) =>
    tab === "active"
      ? !["completed", "rejected"].includes(o.status)
      : tab === "done"
        ? o.status === "completed"
        : o.status === "rejected",
  );
  const activeCount = orders.filter((o) => !["completed", "rejected"].includes(o.status)).length;
  const c = settings?.currency ?? "AED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <span className={`flex items-center gap-1.5 text-sm ${live ? "text-ok" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-ok" : "bg-muted"}`} />
          {live ? "Live" : "Connecting…"}
        </span>
        <span className="flex-1" />
        {!soundOn && (
          <button className="btn-ghost text-sm" onClick={enableSound}>🔔 Turn on new-order sound</button>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={printer.enabled}
            onChange={(e) => savePrinter({ ...printer, enabled: e.target.checked })}
          />
          Auto-print new orders on this device
        </label>
        <select
          className="rounded-lg border border-line bg-paper px-2 py-1"
          value={printer.mode}
          onChange={(e) => savePrinter({ ...printer, mode: e.target.value as PrintMode })}
        >
          <option value="both">Kitchen ticket + receipt</option>
          <option value="kitchen">Kitchen ticket only</option>
          <option value="receipt">Receipt only</option>
        </select>
        <span className="text-muted">Turn this on only on the computer connected to the printer.</span>
        <span className="hidden h-5 w-px bg-line md:block" />
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" className="h-4 w-4 accent-ok" checked={waAuto} onChange={(e) => saveWaAuto(e.target.checked)} />
          Open WhatsApp message when I change status
        </label>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["active", `Active (${activeCount})`],
            ["done", "Completed"],
            ["rejected", "Rejected"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-ink text-white" : "border border-line bg-paper"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="py-12 text-center text-muted">No orders here yet.</p>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((o) => {
          const next = NEXT[o.status];
          const finalStep =
            o.status === "ready"
              ? o.order_type === "delivery"
                ? { to: "out_for_delivery" as const, label: "Out for delivery" }
                : { to: "completed" as const, label: "Picked up" }
              : o.status === "out_for_delivery"
                ? { to: "completed" as const, label: "Delivered" }
                : null;
          const action = next ?? finalStep;
          return (
            <article
              key={o.id}
              className={`card flex flex-col p-4 ${o.status === "new" ? "border-brand ring-2 ring-brand/30" : ""}`}
            >
              <header className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold">#{o.order_no}</div>
                  <div className="text-sm text-muted">
                    {timeShort(o.created_at)} · {o.order_type === "pickup" ? "Pickup" : "Delivery"}
                    {o.zone_name ? ` · ${o.zone_name}` : ""}
                  </div>
                </div>
                <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">{STATUS_LABEL[o.status]}</span>
              </header>

              <ul className="my-3 space-y-0.5">
                {o.order_items?.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span>
                      <b>{i.qty}×</b> {i.name}
                      {i.options?.length > 0 && (
                        <span className="block pl-5 text-sm text-brand-dark">{optionsText(i.options)}</span>
                      )}
                    </span>
                    <span className="text-muted">{money(i.line_total, c)}</span>
                  </li>
                ))}
              </ul>
              {o.notes && <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-sm">📝 {o.notes}</p>}

              <div className="text-sm">
                <div className="font-medium">{o.customer_name}</div>
                <a href={`tel:${o.customer_phone}`} className="text-brand">{o.customer_phone}</a>
                {" · "}
                <a href={waLink(o, o.status)} target="_blank" rel="noreferrer" className="text-ok">
                  WhatsApp
                </a>
                {o.address && <p className="text-muted">{o.address}</p>}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-semibold">
                {o.payment_status === "paid" ? (
                  <>
                    <span className="text-ok">Paid by card ✓</span>
                    <span>{money(o.total, c)}</span>
                  </>
                ) : (
                  <>
                    <span>Cash to collect</span>
                    <span>{money(o.total, c)}</span>
                  </>
                )}
              </div>

              <footer className="mt-3 flex flex-wrap gap-2">
                {action && (
                  <button className="btn flex-1" onClick={() => setStatus(o, action.to)}>
                    {action.label}
                  </button>
                )}
                {o.status === "new" && (
                  <button
                    className="btn-ghost"
                    onClick={() => confirm(`Reject order #${o.order_no}?`) && setStatus(o, "rejected")}
                  >
                    Reject
                  </button>
                )}
                {settings && (
                  <button className="btn-ghost" title="Print" onClick={() => printOrder(o, settings, printer.mode)}>
                    🖨 Print
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
