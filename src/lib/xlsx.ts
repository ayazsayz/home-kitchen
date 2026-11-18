import { strToU8, zipSync } from "fflate";

/** A cell: text, number, or an empty cell. Numbers stay numbers in Excel (sum / sort work). */
export type Cell = string | number | null | undefined;
export type Sheet = {
  name: string;
  rows: Cell[][];
  /** column widths in characters */
  widths?: number[];
  /** rows (0-based) shown in bold, e.g. headers and totals; row 0 is always bold */
  bold?: number[];
  /** number format for numeric cells (default "#,##0.00"); per column if an array */
  numFmt?: string | (string | null)[];
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const col = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ], unique. */
function sheetNames(names: string[]) {
  const used = new Set<string>();
  return names.map((n) => {
    const base = (n.replace(/[:\\/?*[\]]/g, " ").trim() || "Sheet").slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/**
 * Builds a real .xlsx file (Office Open XML) in the browser — no library needed beyond the zip one we already use.
 * Styles: 0 normal, 1 bold, 2 number, 3 bold number, 4 whole number, 5 bold whole number.
 */
export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheetNames(sheets.map((s) => s.name));
  const fmtIds: Record<string, number> = {};
  const fmts: string[] = [];
  const fmtId = (f: string) => {
    if (f === "0") return 1;
    if (f === "#,##0.00") return 4;
    if (!(f in fmtIds)) {
      fmtIds[f] = 164 + fmts.length;
      fmts.push(f);
    }
    return fmtIds[f];
  };
  // cellXfs: index = style id. [0] normal, [1] bold text, then per number format: normal + bold
  const xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>', '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'];
  const numStyle: Record<string, [number, number]> = {};
  const styleFor = (f: string) => {
    if (!numStyle[f]) {
      const id = fmtId(f);
      xfs.push(`<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`);
      xfs.push(`<xf numFmtId="${id}" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>`);
      numStyle[f] = [xfs.length - 2, xfs.length - 1];
    }
    return numStyle[f];
  };

  const sheetXml = sheets.map((sh) => {
    const bold = new Set([0, ...(sh.bold ?? [])]);
    const width = sh.widths ?? [];
    const rows = sh.rows
      .map((r, ri) => {
        const cells = r
          .map((v, ci) => {
            if (v === null || v === undefined || v === "") return "";
            const ref = `${col(ci)}${ri + 1}`;
            const b = bold.has(ri);
            if (typeof v === "number" && Number.isFinite(v)) {
              const f = (Array.isArray(sh.numFmt) ? sh.numFmt[ci] : sh.numFmt) ?? "#,##0.00";
              const [n, nb] = styleFor(f);
              return `<c r="${ref}" s="${b ? nb : n}"><v>${v}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"${b ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
          })
          .join("");
        return `<row r="${ri + 1}">${cells}</row>`;
      })
      .join("");
    const cols = width.length ? `<cols>${width.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  });

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  };
  sheetXml.forEach((x, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(x)));
  // styles last: every number format used is known now
  files["xl/styles.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.length ? `<numFmts count="${fmts.length}">${fmts.map((f) => `<numFmt numFmtId="${fmtIds[f]}" formatCode="${esc(f)}"/>`).join("")}</numFmts>` : ""}<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  return zipSync(files, { level: 6 });
}

/** Builds and downloads an .xlsx file. */
export function downloadXlsx(fileName: string, sheets: Sheet[]) {
  const data = buildXlsx(sheets);
  const blob = new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Money number format for the shop's currency decimals (e.g. 0 for PKR → "#,##0"). */
export const moneyFmt = (decimals: number) => (decimals > 0 ? `#,##0.${"0".repeat(decimals)}` : "#,##0");
