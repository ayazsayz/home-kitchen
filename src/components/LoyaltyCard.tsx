"use client";
import { useEffect, useState } from "react";
import { loyaltyText, type LoyaltyStatus } from "@/lib/loyalty";
import type { Currency } from "@/lib/format";
import Stamps from "./Stamps";
import { useI18n } from "./I18n";

export { Stamps, loyaltyText };

/** Fetches the stamp card for a phone number. */
export function useLoyalty(phone: string, delay = 400) {
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/loyalty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (!cancelled) setStatus(data.enabled && !data.unknown ? data : null);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [phone, delay]);
  return status;
}

/** Stamp card on the menu for returning customers (uses the phone saved on this device). */
export default function LoyaltyCard({ currency }: { currency: Currency }) {
  const [phone, setPhone] = useState("");
  useEffect(() => {
    try {
      setPhone(JSON.parse(localStorage.getItem("hk_customer_v1") || "null")?.phone ?? "");
    } catch {}
  }, []);
  const s = useLoyalty(phone, 0);
  const { t, lang } = useI18n();
  if (!s) return null;
  return (
    <div className="card mt-4 space-y-2 border-brand/30 p-3" data-testid="loyalty-card">
      <div className="flex items-center justify-between text-sm">
        <b>{t("yourStampCard")}</b>
        <span className="text-muted">{s.stamps}/{s.every - 1}</span>
      </div>
      <Stamps s={s} />
      <p className="text-sm">{loyaltyText(s, currency, lang)}</p>
    </div>
  );
}
