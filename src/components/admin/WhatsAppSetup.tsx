"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Settings } from "@/lib/types";

/**
 * Helps the owner point WhatsApp Business chats to the online menu: ready-made greeting / away /
 * quick-reply messages with the shop link, plus a QR code for flyers, packaging and the door.
 */
export default function WhatsAppSetup({ s }: { s: Settings }) {
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!origin) return;
    QRCode.toDataURL(origin, { width: 720, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1f1a14", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [origin]);

  const msgs = [
    { key: "greeting", title: "Greeting message", hint: "WhatsApp Business → Settings → Business tools → Greeting message",
      text: `Assalam o Alaikum! 👋 Welcome to ${s.name}.\nSee our menu and order here 👉 ${origin}\nYou can track your order live. Reply here if you need any help.` },
    { key: "away", title: "Away message", hint: "Business tools → Away message (outside your hours)",
      text: `Thanks for your message! We're closed right now. 🌙\nYou can still see the menu${s.allow_scheduled ? " and pre-order" : ""} here 👉 ${origin}\nWe'll reply as soon as we're back.` },
    { key: "quick", title: "Quick reply  /menu", hint: "Business tools → Quick replies → shortcut “menu”",
      text: `Here's our menu 👉 ${origin}\nOrder there and you'll get live tracking. Cash on delivery${s.card_enabled ? " or card" : ""}. 🙏` },
  ];

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  }

  return (
    <div className="card space-y-4 p-4" data-testid="whatsapp-setup">
      <div>
        <div className="font-semibold">📲 Get WhatsApp chats ordering on the website</div>
        <p className="text-sm text-muted">
          Copy these into the WhatsApp Business app so everyone who messages you gets the menu link. Orders placed there arrive here with tracking,
          loyalty and reports. For customers who still type their order, use <b>+ New order</b> on the Orders screen.
        </p>
      </div>
      <div className="space-y-3">
        {msgs.map((m) => (
          <div key={m.key} className="rounded-xl border border-line p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{m.title}</span>
              <button type="button" className="btn-ghost py-1 text-sm" onClick={() => copy(m.key, m.text)} aria-label={`Copy ${m.title}`}>
                {copied === m.key ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm" data-testid={`wa-${m.key}`}>{m.text}</pre>
            <p className="mt-1 text-xs text-muted">{m.hint}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line p-3">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code for the online menu" className="h-32 w-32" data-testid="menu-qr" />
        ) : (
          <div className="h-32 w-32 animate-pulse rounded bg-cream" />
        )}
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <div className="font-semibold">Menu QR code</div>
          <p className="text-muted">Print it on flyers, food bags and stickers, or set it as a WhatsApp status. Scanning opens your menu.</p>
          {qr && <a className="btn-ghost inline-flex py-1.5 text-sm" href={qr} download={`${s.name.replace(/[^\w-]+/g, "-")}-menu-qr.png`}>⬇ Download QR (PNG)</a>}
          <p className="break-all text-xs text-muted">{origin}</p>
        </div>
      </div>
      <p className="text-xs text-muted">
        Also add the link to your WhatsApp Business profile (Settings → Business profile → Website) and to your catalog. To have the website make the
        WhatsApp messages automatically, see &quot;WhatsApp ordering bot&quot; in the README.
      </p>
    </div>
  );
}
