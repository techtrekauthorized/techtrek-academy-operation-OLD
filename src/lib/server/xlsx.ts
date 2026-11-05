import "server-only";

type CellValue = string | number | null | undefined;

export type XlsxSheet = {
  name: string;
  rows: CellValue[][];
  widths?: number[];
  wrapColumns?: number[];
};

export function createXlsxWorkbookBuffer(sheets: XlsxSheet[]) {
  const safeSheets = sheets.map((sheet, index) => ({ ...sheet, name: safeSheetName(sheet.name || `Sheet ${index + 1}`) }));
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(safeSheets.length) },
    { name: "_rels/.rels", content: relsXml() },
    { name: "xl/workbook.xml", content: workbookXml(safeSheets) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(safeSheets.length) },
    { name: "xl/styles.xml", content: stylesXml() },
    ...safeSheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) })),
  ];
  return Buffer.from(zipStore(files));
}

function worksheetXml(sheet: XlsxSheet) {
  const columnCount = Math.max(...sheet.rows.map(row => row.length), 1);
  const widths = Array.from({ length: columnCount }, (_, index) => sheet.widths?.[index] ?? defaultColumnWidth(sheet.rows, index));
  const wrapColumns = new Set(sheet.wrapColumns ?? []);
  const dimension = `A1:${cellRef(Math.max(sheet.rows.length, 1), columnCount)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(Math.max(width, 10), 60)}" customWidth="1"/>`).join("")}</cols><sheetData>${sheet.rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(value, rowIndex + 1, columnIndex + 1, rowIndex === 0, wrapColumns.has(columnIndex + 1))).join("")}</row>`).join("")}</sheetData>${sheet.rows.length ? `<autoFilter ref="A1:${cellRef(1, columnCount)}"/>` : ""}</worksheet>`;
}

function cellXml(value: CellValue, row: number, column: number, header: boolean, wrap: boolean) {
  const style = header ? 1 : wrap ? 2 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${cellRef(row, column)}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  return `<c r="${cellRef(row, column)}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xmlEscape(displayValue(value))}</t></is></c>`;
}

function defaultColumnWidth(rows: CellValue[][], column: number) {
  const max = rows.reduce((length, row) => Math.max(length, displayValue(row[column]).split(/\r?\n/).reduce((lineMax, line) => Math.max(lineMax, line.length), 0)), 0);
  return Math.min(Math.max(max + 2, 12), 42);
}

function contentTypesXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: sheetCount }, (_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
}

function relsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function workbookXml(sheets: XlsxSheet[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount: number) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: sheetCount }, (_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>`;
}

function safeSheetName(value: string) {
  return value.replace(/[\]\[*?:/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";
}

function displayValue(value: CellValue) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function cellRef(row: number, column: number) {
  let value = column; let name = "";
  while (value > 0) { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); }
  return `${name}${row}`;
}

function xmlEscape(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
}

function zipStore(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0, true); localView.setUint16(8, 0, true); localView.setUint16(10, 0, true); localView.setUint16(12, 0, true); localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true); localView.setUint16(26, name.length, true); local.set(name, 30);
    chunks.push(local, data);
    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true); directoryView.setUint16(4, 20, true); directoryView.setUint16(6, 20, true); directoryView.setUint16(8, 0, true); directoryView.setUint16(10, 0, true); directoryView.setUint16(12, 0, true); directoryView.setUint16(14, 0, true); directoryView.setUint32(16, crc, true); directoryView.setUint32(20, data.length, true); directoryView.setUint32(24, data.length, true); directoryView.setUint16(28, name.length, true); directoryView.setUint32(42, offset, true); directory.set(name, 46);
    central.push(directory);
    offset += local.length + data.length;
  }
  const centralOffset = offset;
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, centralOffset, true);
  return concatUint8([...chunks, ...central, end]);
}

function concatUint8(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of data) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
