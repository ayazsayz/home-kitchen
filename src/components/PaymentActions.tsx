"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Retry card payment, or switch an unpaid card order to cash. */
export default function PaymentActions({ orderId, canPayCard }: { orderId: string; canPayCard: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "card" | "cod">("");
  const [error, setError] = useState("");

  async function go(method: "card" | "cod") {
    setBusy(method);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      router.replace(`/order/${orderId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canPayCard && (
          <button className="btn flex-1" disabled={!!busy} onClick={() => go("card")}>
            {busy === "card" ? "Opening…" : "Pay by card"}
          </button>
        )}
        <button className="btn-ghost flex-1" disabled={!!busy} onClick={() => go("cod")}>
          {busy === "cod" ? "Sending…" : "Pay cash instead"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
