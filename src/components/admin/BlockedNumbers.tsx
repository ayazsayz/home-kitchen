"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { normalisePhone, validPhone } from "@/lib/region";
import { timeShort } from "@/lib/tz";

type Row = { phone: string; reason: string; blocked_by_name: string; created_at: string };

/** Numbers that can't place online orders. Saves straight away (not part of the Settings Save button). */
export default function BlockedNumbers({ countryCode, tz }: { countryCode: string; tz: string }) {
  const db = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data } = await db.from("blocked_phones").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as Row[]);
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    const p = normalisePhone(phone, countryCode);
    if (!validPhone(p)) return setMsg("Enter a valid mobile number");
    const { data: u } = await db.auth.getUser();
    const { data: me } = await db.from("staff").select("name").eq("user_id", u.user?.id ?? "").maybeSingle();
    const { error } = await db.from("blocked_phones").upsert({ phone: p, reason: reason.trim().slice(0, 100), blocked_by_name: me?.name ?? "" });
    if (error) return setMsg(error.message);
    setMsg(`Blocked ${p}.`);
    setPhone("");
    setReason("");
    load();
  }
  async function unblock(r: Row) {
    if (!confirm(`Unblock ${r.phone}? They'll be able to order online again.`)) return;
    await db.from("blocked_phones").delete().eq("phone", r.phone);
    load();
  }

  return (
    <div className="card space-y-3 p-4" data-testid="blocked-numbers">
      <div>
        <div className="font-semibold">🚫 Blocked numbers</div>
        <p className="text-sm text-muted">
          These numbers can&apos;t order online (they&apos;re asked to call you). You can also block a number from any order on the Orders screen.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input w-44" inputMode="tel" placeholder="Mobile number" value={phone} aria-label="Number to block"
          onChange={(e) => setPhone(e.target.value)} />
        <input className="input min-w-0 flex-1" placeholder="Reason (optional, staff only)" value={reason} aria-label="Block reason"
          onChange={(e) => setReason(e.target.value)} />
        <button type="button" className="btn-ghost" onClick={add}>Block</button>
      </div>
      {msg && <p className="text-sm" role="status">{msg}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No blocked numbers.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.phone} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="blocked-row">
              <span>
                <b>{r.phone}</b>
                <span className="block text-xs text-muted">
                  {r.reason || "No reason"} · {r.blocked_by_name || "staff"} · {timeShort(r.created_at, tz)}
                </span>
              </span>
              <button type="button" className="text-sm text-brand" onClick={() => unblock(r)}>Unblock</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
