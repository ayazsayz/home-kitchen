import type { LoyaltyStatus } from "@/lib/loyalty";

/** Row of stamps, e.g. ●●●●●●●○○🎁 */
export default function Stamps({ s }: { s: LoyaltyStatus }) {
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${s.stamps} of ${s.every} stamps`}>
      {Array.from({ length: s.every }, (_, i) => (
        <span
          key={i}
          className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${
            i < s.stamps ? "bg-brand text-white" : i === s.every - 1 ? "border border-dashed border-brand text-brand" : "border border-line"
          }`}
        >
          {i === s.every - 1 ? "🎁" : i < s.stamps ? "✓" : ""}
        </span>
      ))}
    </div>
  );
}
