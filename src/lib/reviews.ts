/** Shared review shapes (safe for client components). */
export type RatingSummary = { avg: number; count: number };
/** What customers see on the menu: first name only, never the phone number. */
export type PublicReview = { id: string; rating: number; comment: string; name: string; created_at: string };

export const LOW_RATING = 3; // 3★ or less is flagged for the owner

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Customer";

export function summarise(ratings: number[]): RatingSummary {
  if (!ratings.length) return { avg: 0, count: 0 };
  return { avg: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10, count: ratings.length };
}
