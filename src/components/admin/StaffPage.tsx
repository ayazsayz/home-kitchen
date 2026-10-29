"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { ROLES, type Role } from "@/lib/roles";

type Staff = { user_id: string; name: string; email: string; role: Role; active: boolean; created_at: string };

export default function StaffPage() {
  const db = useMemo(() => supabaseBrowser(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cook" as Role });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState("");

  const load = useCallback(async () => {
    const [{ data }, { data: u }] = await Promise.all([
      db.from("staff").select("*").order("created_at"),
      db.auth.getUser(),
    ]);
    setStaff((data ?? []) as Staff[]);
    setMe(u.user?.id ?? "");
  }, [db]);
  useEffect(() => {
    load();
  }, [load]);

  async function call(method: "POST" | "PATCH", body: object) {
    const res = await fetch("/api/admin/staff", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || "Something went wrong");
    return d;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await call("POST", form);
      setMsg(`Added ${form.name}. They can sign in at ${window.location.origin}/admin with ${form.email}.`);
      setForm({ name: "", email: "", password: "", role: form.role });
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not add");
    }
    setBusy(false);
  }

  async function change(s: Staff, patch: Partial<Staff> & { password?: string }) {
    setMsg("");
    const { password: _pw, ...visible } = patch;
    void _pw;
    if (Object.keys(visible).length) setStaff((cur) => cur.map((x) => (x.user_id === s.user_id ? { ...x, ...visible } : x))); // instant feedback
    try {
      await call("PATCH", { user_id: s.user_id, ...patch });
      if (patch.password) setMsg(`New password set for ${s.name}.`);
      load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save");
      load();
    }
  }

  const genPassword = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-muted">Each person gets their own login and only sees what their role allows.</p>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Role</th>
                <th className="px-2 py-2 font-medium">Active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.user_id} className={`border-t border-line ${s.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{s.name || "—"} {s.user_id === me && <span className="text-xs text-muted">(you)</span>}</div>
                    <div className="text-xs text-muted">{s.email}</div>
                  </td>
                  <td className="px-2 py-2">
                    <select className="rounded-lg border border-line bg-paper px-2 py-1" value={s.role} aria-label={`Role for ${s.name}`}
                      onChange={(e) => change(s, { role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="checkbox" className="h-4 w-4 accent-ok" checked={s.active} aria-label={`Active ${s.name}`}
                      onChange={(e) => change(s, { active: e.target.checked })} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button className="text-sm text-brand" onClick={() => {
                      const pw = prompt(`New password for ${s.name} (at least 8 characters):`, genPassword());
                      if (pw) change(s, { password: pw });
                    }}>
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {msg && <p className={`text-sm ${/Added|New password/.test(msg) ? "text-ok" : "text-red-700"}`} role="status">{msg}</p>}
        <div className="card p-4 text-sm">
          <div className="mb-2 font-semibold">What each role can do</div>
          <ul className="space-y-1">
            {ROLES.map((r) => (
              <li key={r.role}><b>{r.label}</b> — <span className="text-muted">{r.can}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Turn &quot;Active&quot; off to remove someone&apos;s access straight away. Their past orders and deliveries stay.</p>
        </div>
      </section>

      <form onSubmit={add} className="card h-fit space-y-3 p-4">
        <h2 className="font-semibold">Add staff</h2>
        <div>
          <label className="label" htmlFor="st-name">Name</label>
          <input id="st-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="st-email">Email (their login)</label>
          <input id="st-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="st-pass">Password</label>
          <div className="flex gap-2">
            <input id="st-pass" className="input font-mono" required minLength={8} value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="btn-ghost px-3 text-sm" onClick={() => setForm({ ...form, password: genPassword() })}>Generate</button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="st-role">Role</label>
          <select id="st-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r.role} value={r.role}>{r.label} — {r.can}</option>)}
          </select>
        </div>
        <button className="btn w-full" disabled={busy}>{busy ? "Adding…" : "Add staff"}</button>
        <p className="text-xs text-muted">Share the email and password with them privately (e.g. WhatsApp). They can sign in at /admin.</p>
      </form>
    </div>
  );
}
