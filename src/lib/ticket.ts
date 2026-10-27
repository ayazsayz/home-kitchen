"use client";
import { money, timeShort, vatIncluded } from "./format";
import type { Order, Settings } from "./types";

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type PrintMode = "kitchen" | "receipt" | "both";

/** Kitchen ticket: large quantities, no prices. */
function kitchenTicket(o: Order) {
  const rows = (o.order_items ?? [])
    .map((i) => `<tr><td class="big" style="width:30px">${i.qty}×</td><td class="big">${esc(i.name)}</td></tr>`)
    .join("");
  return `
  <div class="ticket">
    <div style="text-align:center" class="big">KITCHEN · #${o.order_no}</div>
    <div style="text-align:center">${o.order_type === "pickup" ? "PICKUP" : "DELIVERY"} · ${esc(timeShort(o.created_at))}</div>
    <hr/>
    <table>${rows}</table>
    ${o.notes ? `<hr/><div class="big">NOTE: ${esc(o.notes)}</div>` : ""}
    <hr/>
    <div>${esc(o.customer_name)}</div>
  </div>`;
}

/** Customer receipt / delivery slip with prices and address. */
function receipt(o: Order, s: Settings) {
  const c = s.currency;
  const rows = (o.order_items ?? [])
    .map(
      (i) =>
        `<tr><td>${i.qty} × ${esc(i.name)}</td><td style="text-align:right;white-space:nowrap">${money(i.line_total, c)}</td></tr>`,
    )
    .join("");
  const vat = vatIncluded(o.total, o.vat_percent);
  return `
  <div class="ticket">
    <div style="text-align:center" class="big">${esc(s.name)}</div>
    ${s.phone ? `<div style="text-align:center">${esc(s.phone)}</div>` : ""}
    ${s.address ? `<div style="text-align:center">${esc(s.address)}</div>` : ""}
    ${o.vat_percent > 0 && s.trn ? `<div style="text-align:center">TRN ${esc(s.trn)}</div><div style="text-align:center">TAX INVOICE</div>` : ""}
    <hr/>
    <div>Order #${o.order_no} · ${esc(timeShort(o.created_at))}</div>
    <div>${o.order_type === "pickup" ? "Pickup" : "Delivery"} · Cash</div>
    <hr/>
    <table>${rows}</table>
    <hr/>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${money(o.subtotal, c)}</td></tr>
      ${o.delivery_fee > 0 ? `<tr><td>Delivery</td><td style="text-align:right">${money(o.delivery_fee, c)}</td></tr>` : ""}
      <tr><td class="big">TOTAL</td><td class="big" style="text-align:right">${money(o.total, c)}</td></tr>
      ${vat > 0 ? `<tr><td>Incl. VAT ${o.vat_percent}%</td><td style="text-align:right">${money(vat, c)}</td></tr>` : ""}
    </table>
    <hr/>
    <div><b>${esc(o.customer_name)}</b></div>
    <div>${esc(o.customer_phone)}</div>
    ${o.address ? `<div>${esc(o.address)}</div>` : ""}
    ${o.notes ? `<div>Note: ${esc(o.notes)}</div>` : ""}
    <hr/>
    <div style="text-align:center">Thank you!</div>
  </div>`;
}

const CSS = `
  @page { size: 80mm auto; margin: 3mm 4mm; }
  body { margin: 0; background: #fff; }
  .ticket { width: 100%; font-family: ui-monospace, "Courier New", monospace; font-size: 12px; line-height: 1.35; color: #000; }
  .ticket .big { font-size: 18px; font-weight: 700; }
  .ticket hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .ticket table { width: 100%; border-collapse: collapse; }
  .ticket td { vertical-align: top; padding: 1px 0; }
  .cut { page-break-after: always; break-after: page; height: 8mm; }
`;

export function ticketHtml(o: Order, s: Settings, mode: PrintMode) {
  const parts =
    mode === "kitchen" ? [kitchenTicket(o)] : mode === "receipt" ? [receipt(o, s)] : [kitchenTicket(o), receipt(o, s)];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Order ${o.order_no}</title><style>${CSS}</style></head>
  <body>${parts.join('<div class="cut"></div>')}</body></html>`;
}

/**
 * Prints via a hidden iframe. With Chrome started using --kiosk-printing,
 * this goes straight to the default (thermal) printer with no dialog.
 */
export function printOrder(o: Order, s: Settings, mode: PrintMode): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.srcdoc = ticketHtml(o, s, mode);
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
