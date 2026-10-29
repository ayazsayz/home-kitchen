import { I18nProvider } from "./I18n";
import { dirOf } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

const FONTS = "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap";

/** Customer pages: language context + right-to-left layout for Arabic/Urdu. */
export default function CustomerShell({ lang, langs, children }: { lang: Lang; langs: Lang[]; children: React.ReactNode }) {
  return (
    <I18nProvider lang={lang} langs={langs}>
      {/* React hoists this into <head>; only loaded when Arabic/Urdu is offered. */}
      {langs.length > 1 && <link rel="stylesheet" href={FONTS} precedence="default" />}
      <div lang={lang} dir={dirOf(lang)} className="customer-root">
        {children}
      </div>
    </I18nProvider>
  );
}
