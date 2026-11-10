"use client";
import { supabaseBrowser } from "./supabase";
import type { Order } from "./types";

/**
 * Staff orders taken without internet. They are kept on this device (localStorage) and uploaded
 * automatically when the connection is back. Each has a client_ref, so an order sent twice is saved once.
 */
export type QueuedOrder = {
  ref: string;
  placedAt: string;
  tempNo: string; // "OFF-3" — shown and printed until the real order number is known
  body: Record<string, unknown>; // the /api/orders request
  preview: Order; // for the list and printing
  printed?: boolean;
  error?: string; // the server refused it (e.g. a dish was deleted) — staff decide
};

const KEY = "hk_offline_orders_v1";
const COUNTER = "hk_offline_counter_v1";
export const OFFLINE_EVENT = "hk-offline-change";
export const SYNCED_EVENT = "hk-offline-synced";

export function queued(): QueuedOrder[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(list: QueuedOrder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

export function nextTempNo() {
  let n = 0;
  try {
    n = (Number(localStorage.getItem(COUNTER)) || 0) + 1;
    localStorage.setItem(COUNTER, String(n));
  } catch {}
  return `OFF-${n || 1}`;
}

export function enqueue(q: QueuedOrder) {
  save([...queued().filter((x) => x.ref !== q.ref), q]);
}
export function removeQueued(ref: string) {
  save(queued().filter((x) => x.ref !== ref));
}
export function updateQueued(ref: string, patch: Partial<QueuedOrder>) {
  save(queued().map((x) => (x.ref === ref ? { ...x, ...patch } : x)));
}

/** True when the request failed because there is no connection (not because the server said no). */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof DOMException && e.name === "AbortError");

let localServer = false;
/** Docker / offline installs: the app's server is on the shop network, so "no internet" doesn't mean "can't reach it". */
export function setLocalServer(v: boolean) {
  localServer = v;
}
/** Can we reach the app's server? (Real failures are still caught when sending.) */
export const netOnline = () => localServer || typeof navigator === "undefined" || navigator.onLine;

export type SyncResult = { sent: { tempNo: string; orderNo: number }[]; failed: number; offline: boolean; signIn: boolean };

let running: Promise<SyncResult> | null = null;

/** Upload waiting orders, oldest first. Stops at the first connection problem. */
export function syncOffline(opts: { retryFailed?: boolean } = {}): Promise<SyncResult> {
  if (running) return running;
  running = (async () => {
    const out: SyncResult = { sent: [], failed: 0, offline: false, signIn: false };
    const list = queued().filter((q) => opts.retryFailed || !q.error);
    if (!list.length) return out;
    if (!netOnline()) return { ...out, offline: true };
    try {
      await supabaseBrowser().auth.getSession(); // refreshes an expired sign-in before uploading
    } catch {}
    for (const q of list.sort((a, b) => a.placedAt.localeCompare(b.placedAt))) {
      let res: Response;
      try {
        res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...q.body, client_ref: q.ref, offline: true, placed_at: q.placedAt, printed: !!q.printed }),
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        if (isNetworkError(e)) return { ...out, offline: true };
        throw e;
      }
      if (res.status === 401) return { ...out, signIn: true };
      if (res.status >= 500) return { ...out, offline: true }; // server trouble — keep it and try later
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.id) {
        removeQueued(q.ref);
        out.sent.push({ tempNo: q.tempNo, orderNo: d.order_no });
      } else {
        updateQueued(q.ref, { error: d.error || "Could not upload this order" });
        out.failed++;
      }
    }
    if (out.sent.length) window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: out.sent }));
    return out;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Print mode chosen on the Orders screen (kitchen / receipt / both). */
export function printMode(): "kitchen" | "receipt" | "both" {
  try {
    const p = JSON.parse(localStorage.getItem("hk_printer_v1") || "null");
    if (p?.mode === "kitchen" || p?.mode === "receipt" || p?.mode === "both") return p.mode;
  } catch {}
  return "both";
}

/** The service worker: offline page for customers; for staff it also keeps the Orders and New order screens available offline. */
export function registerSW() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const dev = process.env.NODE_ENV !== "production";
  navigator.serviceWorker.register(dev ? "/sw.js?dev=1" : "/sw.js").catch(() => {});
}

/** Ask the service worker to keep fresh copies of the staff screens for offline use. */
export async function warmOfflinePages(paths: string[]) {
  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: "warm", paths });
  } catch {}
}
