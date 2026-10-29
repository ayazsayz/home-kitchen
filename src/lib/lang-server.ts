import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, isLang } from "./i18n";
import type { Lang, Settings } from "./types";

/** The customer's language: their choice (cookie) if the owner offers it, else the shop default. */
export async function currentLang(s: Pick<Settings, "languages" | "default_language">): Promise<Lang> {
  const offered: Lang[] = ["en", ...s.languages.filter((l) => l !== "en")];
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(c) && offered.includes(c)) return c;
  return offered.includes(s.default_language) ? s.default_language : "en";
}

export const offeredLangs = (s: Pick<Settings, "languages">): Lang[] => ["en", ...s.languages.filter((l) => l !== "en")];
