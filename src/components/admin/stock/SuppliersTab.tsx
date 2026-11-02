"use client";
import { Fragment, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { money } from "@/lib/format";
import { todayIn } from "@/lib/tz";
import { whatsappLink } from "@/lib/whatsapp";
import { normalisePhone } from "@/lib/region";
import { supplierBalance } from "@/lib/inventory";
import type { Supplier } from "@/lib/types";
import type { InvProps } from "./StockPage";
import { Field, Modal, Stat } from "./StockTab";

/** Suppliers: contact, what we owe (received purchases − payments), record payments, statement. */
export default function SuppliersTab({ data, reload, go }: InvProps) {
  const db = useMemo(() => supabaseBrowser(), []);
  const { suppliers, purchases, payments, cur, settings } = data;
  const [form, setForm] = useState<{ id?: string; name: string; phone: string; notes: string } | null>(null);
  const [paying, setPaying] = useState<{ s: Supplier; amount: string; paidWith: "cash" | "card" | "bank"; note: string; day: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const bal = (id: string) => supplierBalance(id, purchases, payments);
  const totalOwed = suppliers.reduce((s, x) => s + Math.max(0, bal(x.id)), 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    const row = { name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim() };
    const { error } = form.id ? await db.from("suppliers").update(row).eq("id", form.id) : await db.from("suppliers").insert(row);
    setBusy(false);
    if (error) return setMsg(error.message);
    setForm(null);
    reload();
  }

  async function pay() {
    if (!paying) return;
    const amount = Number(paying.amount);
    if (!(amount > 0)) return setMsg("Enter the amount paid");
    setBusy(true);
    const { error } = await db.from("supplier_payments").insert({
      supplier_id: paying.s.id, amount, paid_with: paying.paidWith, paid_on: paying.day, note: paying.note.trim().slice(0, 200), created_by_name: data.me,
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    setPaying(null);
    await reload();
    setMsg(`Payment of ${money(amount, cur)} to ${paying.s.name} recorded.`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Suppliers" value={String(suppliers.filter((s) => s.active).length)} />
        <Stat label="You owe in total" value={money(totalOwed, cur)} tone={totalOwed > 0 ? "text-red-700" : ""} />
        <div className="col-span-2 flex items-center md:col-span-1">
          <button type="button" className="btn w-full" onClick={() => setForm({ name: "", phone: "", notes: "" })}>+ Add supplier</button>
        </div>
      </div>
      {msg && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">{msg}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Supplier</th>
              <th className="px-2 py-2 text-right font-medium">Bought</th>
              <th className="px-2 py-2 text-right font-medium">You owe</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No suppliers yet — add your butcher, bakery, packaging supplier…</td></tr>}
            {suppliers.map((s) => {
              const b = bal(s.id);
              const bought = purchases.filter((p) => p.supplier_id === s.id && p.status === "received").reduce((x, p) => x + p.total, 0);
              const history = [
                ...purchases.filter((p) => p.supplier_id === s.id && p.status === "received").map((p) => ({ key: p.id, day: p.received_on ?? p.created_at.slice(0, 10), text: `Purchase #${p.purchase_no}`, amount: p.total })),
                ...payments.filter((p) => p.supplier_id === s.id).map((p) => ({ key: p.id, day: p.paid_on, text: `Payment (${p.paid_with})${p.note ? ` · ${p.note}` : ""}`, amount: -p.amount })),
              ].sort((a, c) => c.day.localeCompare(a.day));
              return (
                <Fragment key={s.id}>
                  <tr className={`border-t border-line ${!s.active ? "opacity-50" : ""}`} data-testid="supplier-row">
                    <td className="px-4 py-2">
                      <button type="button" className="text-left font-medium hover:text-brand" onClick={() => setOpen(open === s.id ? null : s.id)}>{s.name}</button>
                      <div className="text-xs text-muted">{s.phone}{s.notes ? ` · ${s.notes}` : ""}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-muted">{money(bought, cur)}</td>
                    <td className={`whitespace-nowrap px-2 py-2 text-right font-semibold ${b > 0 ? "text-red-700" : "text-ok"}`} data-testid="supplier-balance">{money(b, cur)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {s.phone && <a className="me-3 text-ok" target="_blank" rel="noreferrer" href={whatsappLink(normalisePhone(s.phone, settings.phone_country_code), `Salam ${s.name}!`)}>WhatsApp</a>}
                      <button type="button" className="me-3 text-brand" onClick={() => go("purchases", { newPurchase: { supplierId: s.id } })}>Order</button>
                      <button type="button" className="me-3 text-brand" onClick={() => setPaying({ s, amount: b > 0 ? String(b) : "", paidWith: "cash", note: "", day: todayIn(settings.timezone) })} aria-label={`Pay ${s.name}`}>Pay</button>
                      <button type="button" className="text-muted" onClick={() => setForm({ id: s.id, name: s.name, phone: s.phone, notes: s.notes })}>Edit</button>
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr className="bg-cream/50">
                      <td colSpan={4} className="px-4 py-3 text-sm">
                        <div className="mb-1 font-semibold">Statement</div>
                        {history.length === 0 ? <p className="text-muted">Nothing yet.</p> : (
                          <ul className="space-y-0.5">
                            {history.slice(0, 30).map((h) => (
                              <li key={h.key} className="flex gap-3">
                                <span className="w-24 text-muted">{h.day}</span>
                                <span className="flex-1">{h.text}</span>
                                <span className={h.amount < 0 ? "text-ok" : ""}>{h.amount < 0 ? "− " : ""}{money(Math.abs(h.amount), cur)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button type="button" className="mt-2 text-xs text-muted underline"
                          onClick={async () => { await db.from("suppliers").update({ active: !s.active }).eq("id", s.id); reload(); }}>
                          {s.active ? "Hide this supplier" : "Show this supplier again"}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">&quot;You owe&quot; = received purchases minus payments. Payments made on delivery are recorded automatically.</p>

      {form && (
        <Modal title={form.id ? "Edit supplier" : "Add supplier"} onClose={() => setForm(null)}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Name"><input id="sup-name" className="input" required placeholder="e.g. Al Madina Butchery" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Mobile / WhatsApp"><input id="sup-phone" className="input" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Notes"><input id="sup-notes" className="input" placeholder="Delivers Mon & Thu, 7 days credit…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex gap-2">
              <button className="btn" disabled={busy}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {paying && (
        <Modal title={`Pay ${paying.s.name}`} onClose={() => setPaying(null)}>
          <p className="text-sm text-muted">Balance: <b>{money(bal(paying.s.id), cur)}</b></p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount"><input id="pay-amount" className="input" type="number" min={0} step="any" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} /></Field>
            <Field label="Paid with">
              <select className="input" value={paying.paidWith} onChange={(e) => setPaying({ ...paying, paidWith: e.target.value as "cash" | "card" | "bank" })}>
                <option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option>
              </select>
            </Field>
            <Field label="Date"><input className="input" type="date" value={paying.day} onChange={(e) => setPaying({ ...paying, day: e.target.value })} /></Field>
            <Field label="Note"><input className="input" value={paying.note} onChange={(e) => setPaying({ ...paying, note: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-muted">The purchase was already counted as an expense when received, so this payment only reduces what you owe.</p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={pay} disabled={busy}>Save payment</button>
            <button type="button" className="btn-ghost" onClick={() => setPaying(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
