"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
    } else {
      window.location.href = "/admin";
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-4 px-4">
      <h1 className="text-2xl font-bold">Kitchen login</h1>
      <input className="input" type="email" placeholder="Email" required value={email}
        onChange={(e) => setEmail(e.target.value)} />
      <input className="input" type="password" placeholder="Password" required value={password}
        onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
