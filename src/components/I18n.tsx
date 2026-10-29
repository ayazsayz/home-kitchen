"use client";
import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { LANGS, LANG_COOKIE, t as translate, type Key } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

type Ctx = { lang: Lang; langs: Lang[]; t: (key: Key, vars?: Record<string, string | number>) => string };
const I18nContext = createContext<Ctx>({ lang: "en", langs: ["en"], t: (k, v) => translate("en", k, v) });

export function I18nProvider({ lang, langs, children }: { lang: Lang; langs: Lang[]; children: React.ReactNode }) {
  return (
    <I18nContext.Provider value={{ lang, langs, t: (k, v) => translate(lang, k, v) }}>{children}</I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

/** English | العربية | اردو — only the languages the owner turned on. */
export function LanguageSwitcher() {
  const { lang, langs } = useI18n();
  const router = useRouter();
  if (langs.length < 2) return null;
  return (
    <div className="flex gap-1" role="group" aria-label="Language">
      {LANGS.filter((l) => langs.includes(l.lang)).map((l) => (
        <button
          key={l.lang}
          type="button"
          lang={l.lang}
          onClick={() => {
            document.cookie = `${LANG_COOKIE}=${l.lang}; path=/; max-age=31536000; samesite=lax`;
            router.refresh();
          }}
          className={`rounded-full px-3 py-1 text-sm ${lang === l.lang ? "bg-ink text-white" : "border border-line bg-paper"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
