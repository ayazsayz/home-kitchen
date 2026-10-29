"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import type { ReorderLine } from "@/lib/reorder";
import { useI18n } from "./I18n";

/** Puts a past order back in the cart (today's prices) and opens checkout. */
export default function ReorderButton({
  lines,
  skipped,
  className = "btn w-full",
  label,
}: {
  lines: ReorderLine[];
  skipped: string[];
  className?: string;
  label?: string;
}) {
  const cart = useCart();
  const router = useRouter();
  const [note, setNote] = useState("");
  const { t, lang } = useI18n();

  if (!lines.length) {
    return skipped.length ? <p className="text-sm text-muted">{t("notOnMenu")}</p> : null;
  }

  function go() {
    if (skipped.length && !note) {
      setNote(t("willBeLeftOut", { items: skipped.join(lang === "en" ? ", " : "، ") }));
      return;
    }
    cart.clear();
    for (const l of lines) cart.add({ id: l.id, name: l.name, price: l.price, choiceIds: l.choiceIds, optionLabels: l.optionLabels }, l.qty);
    router.push("/checkout");
  }

  return (
    <div className="space-y-1">
      <button type="button" className={className} onClick={go} data-testid="reorder">{label ?? t("reorder")}</button>
      {note && <p className="text-sm text-brand-dark">{note}</p>}
    </div>
  );
}
