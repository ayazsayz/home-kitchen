"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useShop } from "@/lib/use-currency";
import { timeShort } from "@/lib/tz";
import { whatsappLink } from "@/lib/whatsapp";
import { LOW_RATING, summarise } from "@/lib/reviews";
import type { Review } from "@/lib/types";

type Row = Review & { orders: { order_no: number } | null };
type Filter = "all" | "low" | "unseen" | "published";

export default function ReviewsPage() {
  const db = useMemo(() => supabaseBrowser(), []);
  const { tz } = useShop();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await db.from("reviews").select("*, orders(order_no)").order("created_at", { ascending: false }).limit(500);
    if (error) setMsg(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(r: Row, p: Partial<Review>) {
    setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
    const { error } = await db.from("reviews").update(p).eq("id", r.id);
    if (error) {
      setMsg(error.message);
      load();
    }
  }

  async function markAllSeen() {
    setRows((cur) => cur.map((x) => ({ ...x, seen: true })));
    await db.from("reviews").update({ seen: true }).eq("seen", false);
  }

  const sum = summarise(rows.map((r) => r.rating));
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: rows.filter((r) => r.rating === n).length }));
  const last30 = summarise(rows.filter((r) => Date.now() - Date.parse(r.created_at) < 30 * 86400000).map((r) => r.rating));
  const unseen = rows.filter((r) => !r.seen).length;
  const shown = rows.filter((r) =>
    filter === "low" ? r.rating <= LOW_RATING : filter === "unseen" ? !r.seen : filter === "published" ? r.published : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reviews</h1>
          <p className="text-sm text-muted">Customers can rate an order once it&apos;s done. Publish the ones you want shown on the menu.</p>
        </div>
        {unseen > 0 && <button className="btn-ghost text-sm" onClick={markAllSeen}>Mark all as seen ({unseen})</button>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-sm text-muted">Average rating</div>
          <div className="text-3xl font-bold" data-testid="avg-rating">
            {sum.count ? sum.avg.toFixed(1) : "—"} <span className="text-2xl text-amber-500">★</span>
          </div>
          <div className="text-xs text-muted">{sum.count} reviews · last 30 days {last30.count ? last30.avg.toFixed(1) : "—"}</div>
        </div>
        <div className="card p-4 sm:col-span-2">
          {dist.map((d) => (
            <div key={d.n} className="flex items-center gap-2 text-sm">
              <span className="w-8 shrink-0">{d.n}★</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-cream">
                <div className={`h-full ${d.n <= LOW_RATING ? "bg-red-400" : "bg-amber-400"}`} style={{ width: `${sum.count ? (d.count / sum.count) * 100 : 0}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-muted">{d.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([["all", "All"], ["low", `${LOW_RATING}★ or less`], ["unseen", "New"], ["published", "On the menu"]] as [Filter, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm ${filter === k ? "bg-ink text-white" : "border border-line bg-paper"}`}>
            {label}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-red-700">{msg}</p>}
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="card p-6 text-center text-muted">No reviews yet.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            const low = r.rating <= LOW_RATING;
            return (
              <li key={r.id} className={`card space-y-2 p-4 ${low && !r.seen ? "border-red-300 bg-red-50" : ""}`} data-testid="review-row">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-lg text-amber-500">{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></span>
                    {!r.seen && <span className="ms-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">New</span>}
                    <div className="text-sm">
                      <b>{r.customer_name || "Customer"}</b> <span className="text-muted">· {r.customer_phone} · #{r.orders?.order_no ?? "—"} · {timeShort(r.created_at, tz)}</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-ok" checked={r.published} onChange={(e) => patch(r, { published: e.target.checked, seen: true })}
                      aria-label={`Show review from ${r.customer_name} on menu`} />
                    Show on menu
                  </label>
                </div>
                {r.comment ? <p className="whitespace-pre-wrap">{r.comment}</p> : <p className="text-sm text-muted">No comment.</p>}
                <div className="flex flex-wrap gap-2">
                  {low && r.customer_phone && (
                    <a className="btn-ghost py-1.5 text-sm" target="_blank" rel="noreferrer" onClick={() => !r.seen && patch(r, { seen: true })}
                      href={whatsappLink(r.customer_phone, `Hi ${r.customer_name.split(" ")[0] || ""}, thank you for your feedback on order #${r.orders?.order_no ?? ""}. We're sorry it wasn't great — what can we do better?`)}>
                      💬 Follow up on WhatsApp
                    </a>
                  )}
                  {!r.seen && <button className="btn-ghost py-1.5 text-sm" onClick={() => patch(r, { seen: true })}>Mark as seen</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
