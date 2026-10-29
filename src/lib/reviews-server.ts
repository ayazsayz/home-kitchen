import "server-only";
import { supabaseAdmin } from "./supabase-server";
import { firstName, summarise, type PublicReview, type RatingSummary } from "./reviews";

/** Overall rating (all reviews) and the latest published ones for the menu page. */
export async function menuReviews(limit = 6): Promise<{ rating: RatingSummary; reviews: PublicReview[] }> {
  const db = supabaseAdmin();
  const [all, pub] = await Promise.all([
    db.from("reviews").select("rating"),
    db.from("reviews").select("id, rating, comment, customer_name, created_at").eq("published", true).order("created_at", { ascending: false }).limit(limit),
  ]);
  return {
    rating: summarise((all.data ?? []).map((r) => r.rating)),
    reviews: (pub.data ?? []).map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, name: firstName(r.customer_name), created_at: r.created_at })),
  };
}

export async function reviewFor(orderId: string) {
  const { data } = await supabaseAdmin().from("reviews").select("rating, comment").eq("order_id", orderId).maybeSingle();
  return data as { rating: number; comment: string } | null;
}
