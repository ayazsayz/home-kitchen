"use client";
import { currencyOf, money, timeShort, vatIncluded } from "./format";
import { optionsText } from "./options";
import { fmtWhen } from "./schedule";
import { mapsLink } from "./maps";
import type { Order, Settings } from "./types";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type PrintMode = "kitchen" | "receipt" | "both";

/** Kitchen ticket: large quantities, no prices. */
function kitchenTicket(o: Order, s: Pick<Settings, "timezone">) {
  const rows = (o.order_items ?? [])
    .map(
      (i) =>
        `<tr><td class="big" style="width:9mm">${i.qty}×</td><td class="big">${esc(i.name)}${
          i.options?.length ? `<div style="font-size:14px;font-weight:700">+ ${esc(optionsText(i.options))}</div>` : ""
        }</td></tr>`,
    )
    .join("");
  return `
  <div class="ticket">
    <div style="text-align:center" class="big">KITCHEN · ${o.offline_no ?? `#${o.order_no}`}</div>
    ${o.edited_at ? `<div class="big" style="text-align:center;background:#000;color:#fff">** UPDATED ORDER **</div>` : ""}
    <div style="text-align:center">${o.order_type === "pickup" ? "PICKUP" : "DELIVERY"}${o.zone_name ? ` · ${esc(o.zone_name)}` : ""} · ${esc(timeShort(o.created_at, s.timezone))}</div>
    ${o.scheduled_for ? `<div class="big" style="text-align:center;border:2px solid #000;margin-top:4px">FOR ${esc(fmtWhen(o.scheduled_for, s.timezone).toUpperCase())}</div>` : ""}
    <hr/>
    <table>${rows}</table>
    ${o.notes ? `<hr/><div class="big">NOTE: ${esc(o.notes)}</div>` : ""}
    ${o.customer_note ? `<hr/><div class="big">CUSTOMER: ${esc(o.customer_note)}</div>` : ""}
    <div>${o.payment_status === "paid" ? "PAID" : "CASH"}</div>
    <hr/>
    <div>${esc(o.customer_name)}</div>
  </div>`;
}

/** Customer receipt / delivery slip with prices and address. */
function receipt(o: Order, s: Settings, qr: string) {
  const c = currencyOf(s);
  const rows = (o.order_items ?? [])
    .map(
      (i) =>
        `<tr><td>${i.qty} × ${esc(i.name)}${
          i.options?.length ? `<div style="padding-left:12px">${esc(optionsText(i.options))}</div>` : ""
        }</td><td class="amt">${money(i.line_total, c)}</td></tr>`,
    )
    .join("");
  const vat = vatIncluded(o.total, o.vat_percent, c.decimals);
  return `
  <div class="ticket">
    ${s.logo_url ? `<div style="text-align:center"><img src="${esc(s.logo_url)}" style="max-height:18mm;max-width:80%" alt=""/></div>` : ""}
    <div style="text-align:center" class="big">${esc(s.name)}</div>
    ${s.phone ? `<div style="text-align:center">${esc(s.phone)}</div>` : ""}
    ${s.address ? `<div style="text-align:center">${esc(s.address)}</div>` : ""}
    ${o.vat_percent > 0 && s.trn ? `<div style="text-align:center">TRN ${esc(s.trn)}</div><div style="text-align:center">TAX INVOICE</div>` : ""}
    <hr/>
    <div>Order ${o.offline_no ?? `#${o.order_no}`} · ${esc(timeShort(o.created_at, s.timezone))}</div>
    <div>${o.order_type === "pickup" ? "Pickup" : "Delivery"}${o.zone_name ? ` · ${esc(o.zone_name)}` : ""}</div>
    ${o.scheduled_for ? `<div><b>For ${esc(fmtWhen(o.scheduled_for, s.timezone))}</b></div>` : ""}
    <hr/>
    <table>${rows}</table>
    <hr/>
    <table>
      <tr><td>Subtotal</td><td class="amt">${money(o.subtotal, c)}</td></tr>
      ${o.delivery_fee > 0 ? `<tr><td>Delivery</td><td class="amt">${money(o.delivery_fee, c)}</td></tr>` : ""}
      ${o.discount > 0 ? `<tr><td>${o.promo_code === "LOYALTY" ? "Loyalty reward" : `Discount${o.promo_code ? ` (${esc(o.promo_code)})` : ""}`}</td><td class="amt">-${money(o.discount, c)}</td></tr>` : ""}
      <tr><td class="big">TOTAL</td><td class="big amt">${money(o.total, c)}</td></tr>
      ${vat > 0 ? `<tr><td>Incl. VAT ${o.vat_percent}%</td><td class="amt">${money(vat, c)}</td></tr>` : ""}
    </table>
    <div class="big" style="text-align:center;margin-top:4px">${
      o.payment_status === "paid" ? "PAID BY CARD" : `CASH · COLLECT ${money(o.total, c)}`
    }</div>
    <hr/>
    <div><b>${esc(o.customer_name)}</b></div>
    <div>${esc(o.customer_phone)}</div>
    ${o.address ? `<div>${esc(o.address)}</div>` : ""}
    ${o.notes ? `<div>Note: ${esc(o.notes)}</div>` : ""}
    ${qr ? `<div style="text-align:center;margin-top:6px"><img src="${qr}" style="width:30mm;height:30mm" alt=""/><div>Scan for map</div></div>` : ""}
    <hr/>
    <div style="text-align:center">Thank you!</div>
  </div>`;
}

/**
 * Print layout for this device's printer (saved in the browser). Thermal printers can't print to the paper
 * edge: an 80mm printer prints about 72mm, and some drivers have a smaller printable area, so the
 * ticket is drawn narrower than the paper and centred. The owner can fine-tune it with a width test.
 */
export type PrintLayout = { paper: 80 | 58; width: number; shift: number; scale: number };
export const LAYOUT_KEY = "hk_print_layout_v1";
export const DEFAULT_LAYOUT: PrintLayout = { paper: 80, width: 64, shift: 0, scale: 1 };
export const WIDTHS: Record<80 | 58, number[]> = { 80: [56, 60, 64, 68, 72], 58: [40, 44, 48] };

export function getLayout(): PrintLayout {
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
    if (v && (v.paper === 80 || v.paper === 58)) {
      return {
        paper: v.paper,
        width: Math.min(v.paper === 80 ? 76 : 54, Math.max(36, Number(v.width) || DEFAULT_LAYOUT.width)),
        shift: Math.min(6, Math.max(-6, Number(v.shift) || 0)),
        scale: [0.9, 1, 1.15].includes(Number(v.scale)) ? Number(v.scale) : 1,
      };
    }
  } catch {}
  return DEFAULT_LAYOUT;
}
export function saveLayout(l: PrintLayout) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {}
}

function css(l: PrintLayout) {
  const f = (px: number) => `${Math.round(px * l.scale * 10) / 10}px`;
  return `
  @page { size: ${l.paper}mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .ticket { box-sizing: border-box; width: ${l.width}mm; margin: 0 auto; padding: 2mm 1.5mm 2mm 0; position: relative; left: ${l.shift}mm;
    font-family: "Courier New", ui-monospace, monospace; font-size: ${f(12)}; line-height: 1.35; color: #000;
    overflow-wrap: anywhere; word-break: break-word; }
  .ticket .big { font-size: ${f(17)}; font-weight: 700; }
  .ticket hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  .ticket table { width: 100%; border-collapse: collapse; }
  .ticket td { vertical-align: top; padding: 1px 0; }
  /* Amounts take exactly the room they need (measured with the printer's font); names wrap. */
  .ticket td.amt { width: 1%; text-align: right; white-space: nowrap; padding-left: 2mm; }
  .cut { page-break-after: always; break-after: page; height: 8mm; }
`;
}

export function ticketHtml(o: Order, s: Settings, mode: PrintMode, qr = "", layout: PrintLayout = DEFAULT_LAYOUT) {
  const parts =
    mode === "kitchen" ? [kitchenTicket(o, s)] : mode === "receipt" ? [receipt(o, s, qr)] : [kitchenTicket(o, s), receipt(o, s, qr)];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Order ${o.offline_no ?? o.order_no}</title><style>${css(layout)}</style></head>
  <body>${parts.join('<div class="cut"></div>')}</body></html>`;
}

/**
 * Prints via a hidden iframe. With Chrome started using --kiosk-printing,
 * this goes straight to the default (thermal) printer with no dialog.
 */
export async function printOrder(o: Order, s: Settings, mode: PrintMode): Promise<void> {
  const layout = getLayout();
  // QR code of the customer's map pin, so the driver can scan it from the receipt.
  let qr = "";
  const link = mapsLink(o);
  if (link && mode !== "kitchen") {
    try {
      const QR = (await import("qrcode")).default;
      qr = await QR.toDataURL(link, { margin: 0, width: 240, errorCorrectionLevel: "M" });
    } catch {}
  }
  return printHtml(ticketHtml(o, s, mode, qr, layout));
}

/** Prints a widths ruler: the owner picks the widest box that prints with both sides visible. */
export function printWidthTest(layout: PrintLayout = getLayout()) {
  const boxes = WIDTHS[layout.paper]
    .map((w) => `<div style="box-sizing:border-box;width:${w}mm;margin:3mm auto 0;position:relative;left:${layout.shift}mm;border:2px solid #000;padding:2px 0;text-align:center;font:700 16px monospace">${w} mm</div>`)
    .join("");
  return printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Width test</title><style>@page{size:${layout.paper}mm auto;margin:0}body{margin:0}</style></head>
  <body><div style="text-align:center;font:700 15px monospace;margin-top:2mm">PRINT WIDTH TEST</div>
  <div style="text-align:center;font:12px monospace">Pick the widest box with<br/>BOTH side lines printed</div>${boxes}<div style="height:8mm"></div></body></html>`);
}

function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.srcdoc = html;
    frame.onload = () => {
      const w = frame.contentWindow!;
      const done = () => {
        setTimeout(() => frame.remove(), 500);
        resolve();
      };
      w.onafterprint = done;
      w.focus();
      w.print();
      setTimeout(done, 3000); // fallback if afterprint never fires
    };
    document.body.appendChild(frame);
  });
}
