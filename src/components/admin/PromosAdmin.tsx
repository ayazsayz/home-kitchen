"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money, normalise } from "@/lib/format";
import { useShopCurrency } from "@/lib/use-currency";
import { cleanCode, promoLabel } from "@/lib/promo";
import type { PromoCode, PromoKind } from "@/lib/types";

type Draft = {
  id?: string;
  code: string;
  description: string;
  kind: PromoKind;
  value: string;
  min_order: string;
  max_discount: string;
  starts_at: string; // yyyy-mm-dd (Dubai)
  ends_at: string;
  usage_limit: string;
  per_customer_limit: string;
  first_order_only: boolean;
  active: boolean;
};

const EMPTY: Draft = {
  code: "", description: "", kind: "percent", value: "10", min_order: "", max_discount: "",
  starts_at: "", ends_at: "", usage_limit: "", per_customer_limit: "1", first_order_only: false, active: true,
};

// Dates are entered as Dubai calendar days: start = 00:00, end = 23:59:59 that day.
const toStart = (d: string) => (d ? new Date(`${d}T00:00:00+04:00`).toISOString() : null);
const toEnd = (d: string) => (d ? new Date(`${d}T23:59:59+04:00`).toISOString() : null);
const toDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 4 * 3600e3).toISOString().slice(0, 10) : "");
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function status(p: PromoCode, uses: number) {
  const now = new Date();
  if (!p.active) return { label: "Off", tone: "bg-cream text-muted" };
  if (p.ends_at && now > new Date(p.ends_at)) return { label: "Expired", tone: "bg-cream text-muted" };
  if (p.starts_at && now < new Date(p.starts_at)) return { label: "Scheduled", tone: "bg-amber-100 text-amber-900" };
  if (p.usage_limit != null && uses >= p.usage_limit) return { label: "Used up", tone: "bg-cream text-muted" };
  return { label: "Live", tone: "bg-green-100 text-green-800" };
}

export default function PromosAdmin() {
  const db = useMemo(() => supabaseBrowser(), []);
  const cur = useShopCurrency();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [uses, setUses] = useState<Record<string, { count: number; discount: number }>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: o }] = await Promise.all([
      db.from("promo_codes").select("*").order("created_at", { ascending: false }),
      db.from("orders").select("promo_code, discount").not("promo_code", "is", null).not("status", "in", "(rejected,pending_payment)"),
    ]);
    setPromos((p ?? []).map((x) => normalise(x) as PromoCode));
    const u: Record<string, { count: number; discount: number }> = {};
    for (const r of o ?? []) {
      const k = String(r.promo_code).toUpperCase();
      u[k] = { count: (u[k]?.count ?? 0) + 1, discount: (u[k]?.discount ?? 0) + Number(r.discount) };
    }
    setUses(u);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  function edit(p: PromoCode) {
    setErr("");
    setDraft({
      id: p.id, code: p.code, description: p.description ?? "", kind: p.kind, value: String(p.value),
      min_order: p.min_order ? String(p.min_order) : "", max_discount: p.max_discount != null ? String(p.max_discount) : "",
      starts_at: toDay(p.starts_at), ends_at: toDay(p.ends_at),
      usage_limit: p.usage_limit != null ? String(p.usage_limit) : "",
      per_customer_limit: p.per_customer_limit != null ? String(p.per_customer_limit) : "",
      first_order_only: p.first_order_only, active: p.active,
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const code = cleanCode(draft.code);
    if (!code) return setErr("Code can only use letters, numbers, - and _");
    if (draft.kind === "percent" && (Number(draft.value) <= 0 || Number(draft.value) > 100)) return setErr("Percent must be between 1 and 100");
    if (draft.kind === "fixed" && Number(draft.value) <= 0) return setErr("Enter the amount off");
    if (draft.starts_at && draft.ends_at && draft.ends_at < draft.starts_at) return setErr("End date is before start date");
    setBusy(true);
    setErr("");
    const row = {
      code,
      description: draft.description.trim(),
      kind: draft.kind,
      value: draft.kind === "free_delivery" ? 0 : Number(draft.value) || 0,
      min_order: Number(draft.min_order) || 0,
      max_discount: draft.kind === "percent" ? numOrNull(draft.max_discount) : null,
      starts_at: toStart(draft.starts_at),
      ends_at: toEnd(draft.ends_at),
      usage_limit: numOrNull(draft.usage_limit),
      per_customer_limit: numOrNull(draft.per_customer_limit),
      first_order_only: draft.first_order_only,
      active: draft.active,
    };
    const { error } = draft.id
      ? await db.from("promo_codes").update(row).eq("id", draft.id)
      : await db.from("promo_codes").insert(row);
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "That code already exists" : error.message);
    setDraft(null);
    load();
  }

  async function toggle(p: PromoCode) {
    await db.from("promo_codes").update({ active: !p.active }).eq("id", p.id);
    load();
  }

  async function remove() {
    if (!draft?.id || !confirm(`Delete code ${draft.code}? Past orders keep their discount.`)) return;
    await db.from("promo_codes").delete().eq("id", draft.id);
    setDraft(null);
    load();
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promo codes</h1>
          <p className="text-sm text-muted">Customers enter these at checkout.</p>
        </div>
        <button className="btn" onClick={() => { setErr(""); setDraft({ ...EMPTY }); }}>+ New code</button>
      </div>

      {promos.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          No codes yet. Try <b>WELCOME10</b>: 10% off, first order only.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-2 py-2 font-medium">Offer</th>
                <th className="px-2 py-2 font-medium">Rules</th>
                <th className="px-2 py-2 text-right font-medium">Used</th>
                <th className="px-2 py-2 text-right font-medium">Given</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const u = uses[p.code.toUpperCase()] ?? { count: 0, discount: 0 };
                const st = status(p, u.count);
                const rules = [
                  p.min_order > 0 && `min ${money(p.min_order, cur)}`,
                  p.first_order_only && "first order",
                  p.per_customer_limit != null && `${p.per_customer_limit}× per customer`,
                  p.ends_at && `until ${toDay(p.ends_at)}`,
                ].filter(Boolean);
                return (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <button className="font-mono font-semibold text-brand" onClick={() => edit(p)}>{p.code}</button>
                      {p.description && <div className="text-xs text-muted">{p.description}</div>}
                    </td>
                    <td className="px-2 py-2">{promoLabel(p, cur)}</td>
                    <td className="px-2 py-2 text-muted">{rules.join(" · ") || "—"}</td>
                    <td className="px-2 py-2 text-right">{u.count}{p.usage_limit != null && <span className="text-muted"> / {p.usage_limit}</span>}</td>
                    <td className="px-2 py-2 text-right text-muted">{money(u.discount, cur)}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => toggle(p)} title="Click to turn on/off" className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>
                        {st.label}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" onClick={() => setDraft(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto p-5">
            <h2 className="text-lg font-bold">{draft.id ? "Edit code" : "New promo code"}</h2>
            <Field label="Code">
              <input className="input font-mono uppercase" required placeholder="WELCOME10" value={draft.code}
                onChange={(e) => set({ code: cleanCode(e.target.value) })} />
            </Field>
            <Field label="Note (only you see this)">
              <input className="input" placeholder="Instagram launch offer" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="Offer">
              <div className="grid grid-cols-3 gap-2">
                {([["percent", "% off"], ["fixed", `${cur.code} off`], ["free_delivery", "Free delivery"]] as [PromoKind, string][]).map(([k, l]) => (
                  <button type="button" key={k} onClick={() => set({ kind: k })}
                    className={`rounded-xl border px-2 py-2 text-sm font-medium ${draft.kind === k ? "border-brand bg-brand/10 text-brand-dark" : "border-line"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            {draft.kind !== "free_delivery" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={draft.kind === "percent" ? "Percent off" : `Amount off (${cur.code})`}>
                  <input className="input" type="number" min={0} step="any" required value={draft.value} onChange={(e) => set({ value: e.target.value })} />
                </Field>
                {draft.kind === "percent" && (
                  <Field label={`Max discount (${cur.code})`}>
                    <input className="input" type="number" min={0} step="any" placeholder="No cap" value={draft.max_discount} onChange={(e) => set({ max_discount: e.target.value })} />
                  </Field>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Minimum order (${cur.code})`}>
                <input className="input" type="number" min={0} step="any" placeholder="None" value={draft.min_order} onChange={(e) => set({ min_order: e.target.value })} />
              </Field>
              <Field label="Total uses">
                <input className="input" type="number" min={1} step="1" placeholder="Unlimited" value={draft.usage_limit} onChange={(e) => set({ usage_limit: e.target.value })} />
              </Field>
              <Field label="Uses per customer">
                <input className="input" type="number" min={1} step="1" placeholder="Unlimited" value={draft.per_customer_limit} onChange={(e) => set({ per_customer_limit: e.target.value })} />
              </Field>
              <div />
              <Field label="Starts (optional)">
                <input className="input" type="date" value={draft.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
              </Field>
              <Field label="Ends (optional)">
                <input className="input" type="date" value={draft.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={draft.first_order_only} onChange={(e) => set({ first_order_only: e.target.checked })} />
              New customers only (first order from that mobile number)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-ok" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
              Active
            </label>
            {err && <p className="text-sm text-red-700">{err}</p>}
            <div className="flex gap-2 pt-2">
              {draft.id && <button type="button" className="btn-ghost text-red-600" onClick={remove}>Delete</button>}
              <span className="flex-1" />
              <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
