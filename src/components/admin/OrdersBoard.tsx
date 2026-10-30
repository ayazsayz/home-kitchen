"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { currencyOf, money, normalise, normaliseOrder, timeShort } from "@/lib/format";
import { printOrder, type PrintMode } from "@/lib/ticket";
import { optionsText } from "@/lib/options";
import { NOTIFY_STATUSES, renderMessage, whatsappLink } from "@/lib/whatsapp";
import { fmtWhen } from "@/lib/schedule";
import { mapsLink } from "@/lib/maps";
import InstallPrompt from "@/components/InstallPrompt";
import EditOrder from "./EditOrder";
import type { Role } from "@/lib/roles";
import { LOW_RATING } from "@/lib/reviews";
import Link from "next/link";
import { STATUS_LABEL, type Order, type OrderStatus, type Settings } from "@/lib/types";

const PRINTER_KEY = "hk_printer_v1";
const WA_KEY = "hk_whatsapp_v1";
type PrinterPref = { enabled: boolean; mode: PrintMode };

const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  new: { to: "accepted", label: "Accept" },
  accepted: { to: "preparing", label: "Start cooking" },
  preparing: { to: "ready", label: "Mark ready" },
};

type Tab = "active" | "upcoming" | "done" | "rejected";
const UPCOMING_MIN = 90; // accepted scheduled orders due later than this move to "Upcoming"
const isDone = (o: Order) => o.status === "completed" || o.status === "rejected";
const isUpcoming = (o: Order, now: number) =>
  !isDone(o) && o.status !== "new" && !!o.scheduled_for && +new Date(o.scheduled_for) - now > UPCOMING_MIN * 60000;
const dueAt = (o: Order) => +new Date(o.scheduled_for ?? o.created_at);

export default function OrdersBoard({ role = "owner" }: { role?: Role }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [printer, setPrinter] = useState<PrinterPref>({ enabled: false, mode: "both" });
  const [soundOn, setSoundOn] = useState(false);
  const [live, setLive] = useState(false);
  const [waAuto, setWaAuto] = useState(false);
  const [drivers, setDrivers] = useState<{ user_id: string; name: string }[]>([]);
  const [lowReviews, setLowReviews] = useState<{ id: string; rating: number; comment: string; customer_name: string; orders: { order_no: number } | null }[]>([]);
  const canManage = role === "owner" || role === "manager";
  const [editing, setEditing] = useState<Order | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeWa, setNoticeWa] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({}); // customer notes by phone
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000); // keeps "late" badges current
    return () => clearInterval(t);
  }, []);
  const loadNotes = useCallback(
    () => db.from("customer_notes").select("phone, note").then(({ data }) => setNotes(Object.fromEntries((data ?? []).filter((x) => x.note).map((x) => [x.phone, x.note])))),
    [db],
  );
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  async function editNote(o: Order) {
    const v = prompt(`Note about ${o.customer_name || o.customer_phone} (shown on all their orders, e.g. "allergic to nuts"). Leave empty to remove.`, notes[o.customer_phone] ?? "");
    if (v === null) return;
    const note = v.trim().slice(0, 200);
    setNotes((cur) => ({ ...cur, [o.customer_phone]: note }));
    const { data: u } = await db.auth.getUser();
    const { data: me } = await db.from("staff").select("name").eq("user_id", u.user?.id ?? "").maybeSingle();
    if (note) await db.from("customer_notes").upsert({ phone: o.customer_phone, note, updated_by_name: me?.name ?? "", updated_at: new Date().toISOString() });
    else await db.from("customer_notes").delete().eq("phone", o.customer_phone);
    loadNotes();
  }
  async function cancelOrder(o: Order) {
    const reason = prompt(`Cancel order #${o.order_no}? Type the reason (e.g. "customer called to cancel"):`);
    if (reason === null) return;
    if (!reason.trim()) return alert("Please give a reason.");
    const res = await fetch(`/api/admin/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", reason }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return alert(d.error || "Could not cancel");
    setNotice(`Order #${o.order_no} cancelled.`);
    setNoticeWa(waLink({ ...o, status: "rejected" }, "rejected"));
    load();
  }
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const loadBlocked = useCallback(
    () => db.from("blocked_phones").select("phone").then(({ data }) => setBlocked(new Set((data ?? []).map((x) => x.phone)))),
    [db],
  );
  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);
  async function blockNumber(o: Order) {
    if (!confirm(`Block ${o.customer_phone}? This number won't be able to order online any more (you can unblock it in Settings → Fake orders).`)) return;
    setBlocked((cur) => new Set(cur).add(o.customer_phone));
    const { data: u } = await db.auth.getUser();
    const { data: me } = await db.from("staff").select("name").eq("user_id", u.user?.id ?? "").maybeSingle();
    await db.from("blocked_phones").upsert({ phone: o.customer_phone, reason: `Order #${o.order_no}`, blocked_by_name: me?.name ?? "" });
    loadBlocked();
  }
  useEffect(() => {
    if (role !== "owner") return; // only the owner can read the staff list
    db.from("staff").select("user_id, name").eq("role", "driver").eq("active", true).order("name")
      .then(({ data }) => setDrivers(data ?? []));
  }, [db, role]);
  const audio = useRef<AudioContext | null>(null);
  const known = useRef<Set<string>>(new Set());
  const notesRef = useRef<Record<string, string>>({});
  const lateAlerted = useRef<Set<string>>(new Set());
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
      if (data?.length) await printOrder({ ...o, customer_note: notesRef.current[o.customer_phone] }, s, pref.mode);
    },
    [db],
  );

  const load = useCallback(
    async (opts?: { notify?: boolean }) => {
      const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      db.from("reviews").select("id, rating, comment, customer_name, orders(order_no)").lte("rating", LOW_RATING).eq("seen", false)
        .order("created_at", { ascending: false }).limit(5)
        .then(({ data }) => setLowReviews((data ?? []) as unknown as typeof lowReviews));
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

  async function assignDriver(o: Order, driverId: string) {
    const d = drivers.find((x) => x.user_id === driverId);
    setOrders((cur) => cur.map((x) => (x.id === o.id ? { ...x, driver_id: d?.user_id ?? null, driver_name: d?.name ?? "" } : x)));
    await db.from("orders").update({ driver_id: d?.user_id ?? null, driver_name: d?.name ?? "" }).eq("id", o.id);
  }

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

  const now = Date.now();
  const lateMin = settings?.late_minutes ?? 0;
  /** Minutes an order is overdue (0 = on time). ASAP: late_minutes after it was placed; scheduled: past its time. */
  const lateBy = (o: Order) => {
    if (!lateMin || !["new", "accepted", "preparing"].includes(o.status)) return 0;
    const due = o.scheduled_for ? +new Date(o.scheduled_for) : +new Date(o.created_at) + lateMin * 60000;
    return now > due ? Math.ceil((now - due) / 60000) : 0;
  };
  // Beep once when an order becomes late (if the sound is on).
  const lateIds = orders.filter((o) => lateBy(o) > 0).map((o) => o.id);
  const freshLate = lateIds.filter((id) => !lateAlerted.current.has(id));
  if (freshLate.length) {
    freshLate.forEach((id) => lateAlerted.current.add(id));
    if (soundOn) setTimeout(beep, 0);
  }
  const shown = orders
    .filter((o) =>
      tab === "active"
        ? !isDone(o) && !isUpcoming(o, now)
        : tab === "upcoming"
          ? isUpcoming(o, now)
          : tab === "done"
            ? o.status === "completed"
            : o.status === "rejected",
    )
    // Active/upcoming: new orders first, then by when they're due. History: newest first.
    .sort((a, b) =>
      tab === "active" || tab === "upcoming"
        ? Number(b.status === "new") - Number(a.status === "new") || dueAt(a) - dueAt(b)
        : +new Date(b.created_at) - +new Date(a.created_at),
    );
  const activeCount = orders.filter((o) => !isDone(o) && !isUpcoming(o, now)).length;
  const upcomingCount = orders.filter((o) => isUpcoming(o, now)).length;
  const c = settings ? currencyOf(settings) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Orders</h1>
        <span className={`flex items-center gap-1.5 text-sm ${live ? "text-ok" : "text-muted"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "bg-ok" : "bg-muted"}`} />
          {live ? "Live" : "Connecting…"}
        </span>
        <span className="flex-1" />
        <Link href="/admin/new-order" className="btn py-1.5 text-sm" data-testid="new-order-btn">+ New order</Link>
        {!soundOn && (
          <button className="btn-ghost text-sm" onClick={enableSound}>🔔 Turn on new-order sound</button>
        )}
      </div>

      {lowReviews.length > 0 && (
        <div className="card space-y-1 border-red-300 bg-red-50 p-3 text-sm text-red-900" data-testid="low-rating-banner">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>⚠️ {lowReviews.length === 1 ? "A customer" : `${lowReviews.length} customers`} rated {LOW_RATING}★ or less</b>
            {canManage && <Link href="/admin/reviews" className="font-semibold underline">Open reviews</Link>}
          </div>
          {lowReviews.map((r) => (
            <div key={r.id}>
              {"★".repeat(r.rating)} · #{r.orders?.order_no ?? "—"} {r.customer_name}{r.comment ? `: “${r.comment}”` : ""}
              {canManage && (
                <button className="ms-2 text-xs underline" onClick={async () => {
                  setLowReviews((cur) => cur.filter((x) => x.id !== r.id));
                  await db.from("reviews").update({ seen: true }).eq("id", r.id);
                }}>Dismiss</button>
              )}
            </div>
          ))}
        </div>
      )}

      <InstallPrompt name={settings?.name ?? "Kitchen"} kitchen />
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
            ["upcoming", `Upcoming (${upcomingCount})`],
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

      {notice && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {notice}
          {noticeWa && <a href={noticeWa} target="_blank" rel="noreferrer" className="font-semibold underline">💬 Tell the customer on WhatsApp</a>}
        </p>
      )}
      {editing && (
        <EditOrder order={editing} cur={c} onClose={() => setEditing(null)}
          onSaved={(m, total) => {
            const o = editing;
            setEditing(null);
            setNotice(m);
            setNoticeWa(whatsappLink(o.customer_phone, `Hi ${o.customer_name.split(" ")[0]}, we've updated your order #${o.order_no} as discussed. New total: ${money(total, c)}. ${window.location.origin}/order/${o.id}`));
            load();
          }} />
      )}
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
              className={`card flex flex-col p-4 ${lateBy(o) ? "border-red-500 bg-red-50 ring-2 ring-red-400" : o.status === "new" ? "border-brand ring-2 ring-brand/30" : ""}`}
              data-late={lateBy(o) ? "1" : undefined}
            >
              <header className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold">#{o.order_no}</div>
                  <div className="text-sm text-muted">
                    {timeShort(o.created_at, settings?.timezone)} · {o.order_type === "pickup" ? "Pickup" : "Delivery"}
                    {o.zone_name ? ` · ${o.zone_name}` : ""}
                  </div>
                  {o.scheduled_for && (() => {
                    const mins = (+new Date(o.scheduled_for) - now) / 60000;
                    const tone = isDone(o) ? "bg-cream text-muted" : mins <= 30 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900";
                    return (
                      <div className={`mt-1 inline-block rounded-md px-2 py-0.5 text-sm font-semibold ${tone}`}>
                        ⏰ For {fmtWhen(o.scheduled_for, settings?.timezone)}
                      </div>
                    );
                  })()}
                </div>
                <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">{STATUS_LABEL[o.status]}</span>
              </header>
              {(blocked.has(o.customer_phone) || (o.first_order && !isDone(o)) || lateBy(o) > 0 || o.edited_at || o.cancel_reason || (o.source && o.source !== "web")) && (
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                  {o.source && o.source !== "web" && (
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-emerald-900" data-testid="source-badge">
                      {o.source === "whatsapp" ? "💬 WhatsApp" : o.source === "phone" ? "📞 Phone" : "🚶 Walk-in"} order{o.created_by_name ? ` · by ${o.created_by_name}` : ""}
                    </span>
                  )}
                  {lateBy(o) > 0 && <span className="animate-pulse rounded-md bg-red-600 px-2 py-0.5 text-white" data-testid="late-badge">⏰ Late by {lateBy(o)} min</span>}
                  {o.edited_at && <span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-900" title={o.edit_note}>✏️ Updated{o.edit_note ? ` · ${o.edit_note}` : ""}</span>}
                  {o.cancel_reason && <span className="rounded-md bg-cream px-2 py-0.5 text-red-800" data-testid="cancelled-badge">Cancelled by {o.cancelled_by_name || "staff"}: {o.cancel_reason}</span>}
                  {blocked.has(o.customer_phone) && <span className="rounded-md bg-red-600 px-2 py-0.5 text-white" data-testid="blocked-badge">🚫 Blocked number</span>}
                  {o.first_order && !isDone(o) && (
                    <span className="rounded-md bg-sky-100 px-2 py-0.5 text-sky-900" data-testid="first-order-badge">🆕 First order — call to confirm</span>
                  )}
                </div>
              )}

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
              {o.discount > 0 && (
                <p className="mb-2 flex justify-between text-sm text-ok">
                  <span>{o.promo_code === "LOYALTY" ? "⭐ Loyalty reward" : `Promo ${o.promo_code}`}</span>
                  <span>− {money(o.discount, c)}</span>
                </p>
              )}
              {o.notes && <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-sm">📝 {o.notes}</p>}
              {notes[o.customer_phone] && (
                <p className="mb-2 rounded-lg border border-amber-300 bg-amber-100 px-2 py-1 text-sm font-medium" data-testid="customer-note">📌 {notes[o.customer_phone]}</p>
              )}

              <div className="text-sm">
                <div className="font-medium">{o.customer_name}</div>
                <a href={`tel:${o.customer_phone}`} className="text-brand">{o.customer_phone}</a>
                {" · "}
                <a href={waLink(o, o.status)} target="_blank" rel="noreferrer" className="text-ok">
                  WhatsApp
                </a>
                {o.address && <p className="text-muted">{o.address}</p>}
                {o.order_type === "delivery" && (o.driver_name || (drivers.length > 0 && ["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status))) && (
                  <div className="mt-1 flex items-center gap-2">
                    <span>🛵</span>
                    {drivers.length > 0 && o.status !== "completed" ? (
                      <select className="rounded-lg border border-line bg-paper px-2 py-0.5 text-sm" value={o.driver_id ?? ""}
                        aria-label={`Driver for order ${o.order_no}`} onChange={(e) => assignDriver(o, e.target.value)}>
                        <option value="">No driver yet</option>
                        {drivers.map((d) => <option key={d.user_id} value={d.user_id}>{d.name}</option>)}
                      </select>
                    ) : (
                      <span className="font-medium">{o.driver_name}</span>
                    )}
                  </div>
                )}
                {mapsLink(o) && (
                  <a href={mapsLink(o)} target="_blank" rel="noreferrer" className="text-brand">📍 Open in Google Maps</a>
                )}
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
                {["new", "accepted", "preparing", "ready"].includes(o.status) && o.payment_status !== "paid" && (
                  <button className="btn-ghost" onClick={() => setEditing(o)} aria-label={`Edit order ${o.order_no}`}>✏️ Edit</button>
                )}
                {["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status) && (
                  <button className="btn-ghost text-red-700" onClick={() => cancelOrder(o)} aria-label={`Cancel order ${o.order_no}`}>Cancel order</button>
                )}
                {canManage && (
                  <button className="btn-ghost" onClick={() => editNote(o)} aria-label={`Customer note for order ${o.order_no}`} title="Note about this customer">📌</button>
                )}
                {canManage && !blocked.has(o.customer_phone) && ["new", "rejected"].includes(o.status) && (
                  <button className="btn-ghost text-red-700" onClick={() => blockNumber(o)} aria-label={`Block number for order ${o.order_no}`}>
                    🚫 Block
                  </button>
                )}
                {settings && (
                  <button className="btn-ghost" title="Print" onClick={() => printOrder({ ...o, customer_note: notes[o.customer_phone] }, settings, printer.mode)}>
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
