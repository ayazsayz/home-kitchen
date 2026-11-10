"use client";
import { useCallback, useEffect, useState } from "react";
import { money, currencyOf } from "@/lib/format";
import { printOrder } from "@/lib/ticket";
import { timeShort } from "@/lib/tz";
import {
  OFFLINE_EVENT, netOnline, printMode, queued, registerSW, removeQueued, setLocalServer, syncOffline, updateQueued, warmOfflinePages, type QueuedOrder,
} from "@/lib/offline-orders";
import type { Settings } from "@/lib/types";

export const SETTINGS_KEY = "hk_offline_settings_v1"; // shop details for printing offline tickets

/**
 * Shown on every staff screen: "No internet" notice, orders saved on this device and waiting to upload,
 * and the upload result. Uploads run automatically when the connection comes back (and every 30 s).
 */
export default function OfflineBar({ role, local = false }: { role: string; local?: boolean }) {
  setLocalServer(local); // set before children use it
  const [online, setOnline] = useState(true);
  const [list, setList] = useState<QueuedOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [signIn, setSignIn] = useState(false);
  const [sure, setSure] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (retryFailed = false) => {
    if (!queued().length) return;
    setBusy(true);
    try {
      const r = await syncOffline({ retryFailed });
      setSignIn(r.signIn);
      if (r.sent.length) {
        setNote(`✓ Uploaded ${r.sent.map((x) => `${x.tempNo} → #${x.orderNo}`).join(", ")}`);
        setTimeout(() => setNote(""), 15000);
      }
    } catch {}
    setBusy(false);
  }, []);

  useEffect(() => {
    registerSW();
    const refresh = () => setList(queued());
    const up = () => {
      setOnline(true);
      run();
    };
    const down = () => setOnline(netOnline());
    setOnline(netOnline());
    refresh();
    window.addEventListener(OFFLINE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    run();
    const t = setInterval(() => run(), 30000);
    if (netOnline() && role !== "driver") warmOfflinePages(["/admin", "/admin/new-order"]);
    return () => {
      window.removeEventListener(OFFLINE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, [run, role]);

  const failed = list.filter((q) => q.error);
  if (online && !list.length && !note) return null;

  const shop = (): Settings | null => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    } catch {
      return null;
    }
  };
  const print = (q: QueuedOrder) => {
    const s = shop();
    if (!s) return;
    printOrder(q.preview, s, printMode());
    updateQueued(q.ref, { printed: true });
  };

  return (
    <div className="print:hidden" data-testid="offline-bar">
      {!online && (
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white" role="status">
          📶 No internet — you can still take orders on <b>New order</b>. They are saved on this device and upload automatically when the internet is back.
        </div>
      )}
      {list.length > 0 && (
        <div className={`px-4 py-2 text-sm ${failed.length ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <span data-testid="offline-count">
              🕓 {list.length} order{list.length > 1 ? "s" : ""} saved on this device{online ? (busy ? " — uploading…" : " — waiting to upload") : " — will upload when online"}
              {failed.length > 0 && ` · ${failed.length} need${failed.length > 1 ? "" : "s"} attention`}
            </span>
            {signIn && <a href="/admin/login" className="font-semibold underline">Sign in again to upload</a>}
            <span className="flex-1" />
            <button type="button" className="font-semibold underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>
            {online && (
              <button type="button" className="font-semibold underline" disabled={busy} onClick={() => run(true)}>Upload now</button>
            )}
          </div>
          {open && (
            <ul className="mx-auto mt-2 max-w-6xl space-y-1" data-testid="offline-list">
              {list.map((q) => {
                const cur = currencyOf(shop() ?? {});
                return (
                  <li key={q.ref} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5">
                    <b>{q.tempNo}</b>
                    <span>{q.preview.customer_name} · {q.preview.order_type === "pickup" ? "Pickup" : "Delivery"} · {money(q.preview.total, cur)}</span>
                    <span className="text-xs text-muted">{timeShort(q.placedAt, shop()?.timezone)}</span>
                    {q.error && <span className="text-xs font-medium text-red-700">⚠ {q.error}</span>}
                    <span className="flex-1" />
                    <button type="button" className="text-brand" onClick={() => print(q)}>Print</button>
                    {q.error && (
                      sure === q.ref ? (
                        <button type="button" className="font-semibold text-red-700" onClick={() => { removeQueued(q.ref); setSure(""); }}>Yes, delete it</button>
                      ) : (
                        <button type="button" className="text-red-700" onClick={() => setSure(q.ref)}>Delete</button>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {note && <div className="bg-green-50 px-4 py-2 text-center text-sm text-green-800" data-testid="offline-note">{note}</div>}
    </div>
  );
}
