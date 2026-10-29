"use client";
import { useEffect, useState } from "react";
import type { ReorderLine } from "@/lib/reorder";
import ReorderButton from "./ReorderButton";
import { useI18n } from "./I18n";

export const LAST_ORDER_KEY = "hk_last_order_v1";

type Last = { order_no: number; created_at: string; summary: string; lines: ReorderLine[]; skipped: string[] };

/** "Your last order — Order again" for returning customers (remembered on this device only). */
export default function LastOrderCard() {
  const [last, setLast] = useState<Last | null>(null);
  const { t } = useI18n();
  useEffect(() => {
    let id = "";
    try {
      id = localStorage.getItem(LAST_ORDER_KEY) || "";
    } catch {}
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    fetch(`/api/orders/${id}/reorder`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && d.lines?.length && setLast(d))
      .catch(() => {});
  }, []);
  if (!last) return null;
  const days = Math.floor((Date.now() - Date.parse(last.created_at)) / 86400000);
  return (
    <div className="card mt-4 flex items-center gap-3 p-3" data-testid="last-order">
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">{t("lastOrder")} <span className="font-normal text-muted">· {days === 0 ? t("todayLower") : days === 1 ? t("yesterdayLower") : t("daysAgo", { n: days })}</span></div>
        <div className="truncate text-muted">{last.summary}</div>
      </div>
      <div className="shrink-0">
        <ReorderButton lines={last.lines} skipped={last.skipped} className="btn px-3 py-1.5 text-sm" label={t("orderAgain")} />
      </div>
    </div>
  );
}
