"use client";
import { useState } from "react";
import { useI18n } from "./I18n";

/** 1–5 stars + comment, shown on the order page once the order is done. */
export default function RateOrder({ orderId, existing }: { orderId: string; existing: { rating: number; comment: string } | null }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (done) {
    return (
      <section className="card space-y-1 p-4 text-center" data-testid="review-done">
        <p className="font-semibold">{t("thanksReview")}</p>
        <p className="text-2xl text-amber-500" aria-label={`${done.rating}/5`}>
          {"★".repeat(done.rating)}<span className="text-line">{"★".repeat(5 - done.rating)}</span>
        </p>
        {done.comment && <p className="text-sm text-muted">“{done.comment}”</p>}
      </section>
    );
  }

  async function send() {
    if (!rating) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) throw new Error(d.error || t("somethingWrong"));
      setDone({ rating, comment: comment.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("somethingWrong"));
    }
    setBusy(false);
  }

  return (
    <section className="card space-y-3 p-4" data-testid="rate-order">
      <h2 className="text-center font-semibold">{t("rateTitle")}</h2>
      <div className="flex justify-center gap-1" dir="ltr" role="radiogroup" aria-label={t("yourRating")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`}
            onClick={() => setRating(n)}
            className={`text-4xl leading-none transition ${n <= rating ? "text-amber-500" : "text-line hover:text-amber-300"}`}>
            ★
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea className="input" rows={2} maxLength={500} placeholder={t("ratePh")} value={comment}
            onChange={(e) => setComment(e.target.value)} aria-label={t("ratePh")} />
          <button type="button" className="btn w-full" onClick={send} disabled={busy}>{busy ? t("sending") : t("send")}</button>
        </>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
