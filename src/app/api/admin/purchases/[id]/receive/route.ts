import { NextResponse } from "next/server";
import { currentStaff } from "@/lib/require-staff";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getSettings } from "@/lib/data";
import { normalise, roundMoney } from "@/lib/format";
import { fmtQty, newAvgCost, recipeCost } from "@/lib/inventory";
import { todayIn } from "@/lib/tz";
import type { PurchaseLine, RecipeLine, StockItem } from "@/lib/types";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

type Body = {
  lines?: { id: string; qty: number; unit_price: number }[];
  paid?: number; // paid to the supplier now (rest goes on credit)
  paid_with?: "cash" | "card" | "bank";
  category?: string; // expense category
  received_on?: string; // YYYY-MM-DD
};

/**
 * A supplier delivery arrived: adds the stock, updates average costs (and the cost of dishes made
 * from those ingredients), records the expense, and the payment if paid now.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentStaff();
  if (!me || !["owner", "manager"].includes(me.role)) return bad("Not allowed", 401);
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Body;
  const db = supabaseAdmin();
  const s = await getSettings();

  const { data: p } = await db.from("purchases").select("*, purchase_lines(*)").eq("id", id).maybeSingle();
  if (!p) return bad("Purchase not found", 404);
  if (p.status !== "ordered") return bad(p.status === "received" ? "This delivery was already received" : "This purchase was cancelled");

  // Final quantities/prices as delivered (staff may correct them on receipt).
  const given = new Map((b.lines ?? []).map((l) => [l.id, l]));
  const lines = ((p.purchase_lines ?? []) as PurchaseLine[]).map((l) => {
    const g = given.get(l.id);
    return {
      ...normalise(l),
      qty: g ? Math.max(0, Number(g.qty) || 0) : Number(l.qty),
      unit_price: g ? Math.max(0, Number(g.unit_price) || 0) : Number(l.unit_price),
    };
  });
  const keep = lines.filter((l) => l.qty > 0);
  if (!keep.length) return bad("Nothing was received. Cancel the purchase instead.");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(b.received_on ?? "") ? b.received_on! : todayIn(s.timezone);
  const total = roundMoney(keep.reduce((sum, l) => sum + l.qty * l.unit_price, 0), 3);
  const paid = Math.min(total, Math.max(0, Number(b.paid) || 0));

  // Claim it first so a double-click can't receive twice.
  const { data: claimed } = await db.from("purchases").update({ status: "received", total, received_on: day }).eq("id", id).eq("status", "ordered").select("id");
  if (!claimed?.length) return bad("This delivery was already received");

  for (const l of lines) {
    if (l.qty > 0) await db.from("purchase_lines").update({ qty: l.qty, unit_price: l.unit_price }).eq("id", l.id);
    else await db.from("purchase_lines").delete().eq("id", l.id);
  }

  // Stock in + average cost.
  const ids = [...new Set(keep.map((l) => l.stock_item_id))];
  const { data: itemsRaw } = await db.from("stock_items").select("*").in("id", ids);
  const items = new Map(((itemsRaw ?? []) as StockItem[]).map((i) => [i.id, normalise(i)]));
  for (const l of keep) {
    const it = items.get(l.stock_item_id);
    if (!it) continue;
    const avg = newAvgCost(it.qty, it.avg_cost, l.qty, l.unit_price);
    await db.from("stock_items").update({ avg_cost: roundMoney(avg, 4) }).eq("id", it.id);
    await db.from("stock_moves").insert({ stock_item_id: it.id, change: l.qty, kind: "purchase", ref_id: id, note: `Purchase #${p.purchase_no}${p.supplier_name ? ` · ${p.supplier_name}` : ""}`, created_by_name: me.name });
    items.set(it.id, { ...it, qty: it.qty + l.qty, avg_cost: avg });
  }

  // Expense (the full cost, whether paid now or on credit).
  const names = keep.map((l) => `${items.get(l.stock_item_id)?.name ?? "item"} ${fmtQty(l.qty, items.get(l.stock_item_id)?.unit)}`).join(", ");
  const category = (b.category && s.expense_categories.includes(b.category) ? b.category : null) ?? (s.expense_categories.includes("Groceries") ? "Groceries" : "Other");
  const { data: exp } = await db
    .from("expenses")
    .insert({ spent_on: day, category, description: `Purchase #${p.purchase_no}: ${names}`.slice(0, 300), vendor: p.supplier_name, amount: total, paid_with: b.paid_with ?? "cash" })
    .select("id")
    .single();
  if (exp) await db.from("purchases").update({ expense_id: exp.id }).eq("id", id);

  if (paid > 0 && p.supplier_id) {
    await db.from("supplier_payments").insert({ supplier_id: p.supplier_id, amount: paid, paid_with: b.paid_with ?? "cash", paid_on: day, note: `Paid on delivery #${p.purchase_no}`, created_by_name: me.name });
  }

  // Dishes made with these ingredients get their cost refreshed from the recipe.
  const { data: affected } = await db.from("recipe_lines").select("menu_item_id").in("stock_item_id", ids);
  const dishIds = [...new Set((affected ?? []).map((r) => r.menu_item_id))];
  if (dishIds.length) {
    const [{ data: recipes }, { data: all }] = await Promise.all([
      db.from("recipe_lines").select("*").in("menu_item_id", dishIds),
      db.from("stock_items").select("id, avg_cost"),
    ]);
    const stock = (all ?? []).map((x) => normalise(x) as Pick<StockItem, "id" | "avg_cost">);
    for (const d of dishIds) {
      const mine = ((recipes ?? []) as RecipeLine[]).filter((r) => r.menu_item_id === d).map((r) => normalise(r));
      await db.from("menu_items").update({ cost: recipeCost(mine, stock) }).eq("id", d);
    }
  }

  return NextResponse.json({ ok: true, total, paid, owed: roundMoney(total - paid, 3), expense_id: exp?.id ?? null });
}
