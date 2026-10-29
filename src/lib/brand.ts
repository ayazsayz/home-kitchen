import type { CSSProperties } from "react";

export const DEFAULT_BRAND = "#c2410c";

export const BRAND_PRESETS = ["#c2410c", "#b91c1c", "#be185d", "#7c3aed", "#1d4ed8", "#0f766e", "#15803d", "#a16207", "#1f2937"];

export function normalizeHex(v: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v || "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/** Mix a colour towards black (amount 0–1). */
export function darken(hex: string, amount = 0.2) {
  const h = normalizeHex(hex) ?? DEFAULT_BRAND;
  const n = parseInt(h.slice(1), 16);
  const f = (c: number) => Math.round(c * (1 - amount));
  const out = (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255);
  return `#${out.toString(16).padStart(6, "0")}`;
}

/** Relative luminance check so text on the brand colour stays readable. */
export function isTooLight(hex: string) {
  const h = normalizeHex(hex) ?? DEFAULT_BRAND;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

/** CSS variables that re-colour every brand-coloured button, link and badge. */
export function brandStyle(color: string | undefined): CSSProperties {
  const c = normalizeHex(color ?? "") ?? DEFAULT_BRAND;
  return { ["--color-brand" as string]: c, ["--color-brand-dark" as string]: darken(c, 0.22) } as CSSProperties;
}
