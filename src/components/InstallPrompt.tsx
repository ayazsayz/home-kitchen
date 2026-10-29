"use client";
import { useEffect, useState } from "react";
import { useI18n } from "./I18n";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install the app" banner. Android/desktop Chrome: one-tap install.
 * iPhone/iPad Safari: shows the Share → Add to Home Screen tip. Hidden once installed or dismissed.
 */
export default function InstallPrompt({ name, kitchen = false }: { name: string; kitchen?: boolean }) {
  const key = kitchen ? "hk_install_kitchen_dismissed" : "hk_install_dismissed";
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === "1";
    } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [key]);

  if (hidden || (!evt && !ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(key, "1");
    } catch {}
  };

  return (
    <div className="card mt-4 flex items-center gap-3 p-3 text-sm" data-testid="install-prompt">
      <span className="text-2xl" aria-hidden>📲</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{kitchen ? "Install the kitchen screen" : t("getApp", { name })}</div>
        <div className="text-muted">
          {ios && kitchen ? (
            <>Tap <b>Share</b> <span aria-hidden>⬆️</span> then <b>Add to Home Screen</b>.</>
          ) : ios ? (
            t("iosTip")
          ) : kitchen ? (
            "Opens full-screen, like an app."
          ) : (
            t("orderFaster")
          )}
        </div>
      </div>
      {evt && (
        <button
          className="btn px-3 py-1.5"
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice.catch(() => null);
            setEvt(null);
            setHidden(true);
          }}
        >
          {kitchen ? "Install" : t("install")}
        </button>
      )}
      <button className="px-1 text-muted" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
