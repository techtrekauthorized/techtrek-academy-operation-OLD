import "server-only";
import type { sheets_v4 } from "googleapis";
import { getSheetsClient, getSpreadsheetId } from "./client";
import type { SheetRow } from "../types";

export const TABS = ["Universities", "Tracks", "Students", "Enrollments", "Payments_Receipts", "System_Config", "Users", "Delivery_Tracks", "Delivery_Track_Levels", "Offering_Delivery_Map", "Batches", "Batch_Levels", "Groups", "Sessions", "Staff", "Batch_Staff_Assignments", "Attendance_Sessions", "Attendance_Session_Groups", "Attendance_Form_Responses", "Attendance_Validated", "Recorded_Sessions", "Recorded_Session_Groups", "Session_Materials", "Session_Material_Groups", "Learning_Resources", "Learning_Resource_Groups", "Student_Documents", "Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility", "Learning_Roadmaps", "Learning_Roadmap_Items", "Batch_Roadmaps", "Certificates"] as const;
export type SheetTab = typeof TABS[number];

export async function readSheet<T extends Record<string, string>>(tab: SheetTab): Promise<SheetRow<T>[]> {
  const sheets = await getSheetsClient();
  const response = await withReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: getSpreadsheetId(), range: `'${tab}'!A:ZZ` }));
  const values = response.data.values ?? [];
  const headers = (values[0] ?? []).map(String);
  return values.slice(1).map((cells, index) => {
    const record: Record<string, string | number> = { _rowNumber: index + 2 };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? ""); });
    return record as SheetRow<T>;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && value !== ""));
}

export async function readSheetDataRegion<T extends Record<string, string>>(tab: SheetTab): Promise<SheetRow<T>[]> {
  const sheets = await getSheetsClient();
  const response = await withReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: getSpreadsheetId(), range: `'${tab}'!A:ZZ` }));
  const values = response.data.values ?? [];
  const headers = (values[0] ?? []).map(String);
  const rows: SheetRow<T>[] = [];
  for (let index = 1; index < values.length; index++) {
    const cells = values[index] ?? [];
    if (!cells.some(cell => String(cell ?? "").trim() !== "")) break;
    const record: Record<string, string | number> = { _rowNumber: index + 1 };
    headers.forEach((header, column) => { record[header] = String(cells[column] ?? ""); });
    rows.push(record as SheetRow<T>);
  }
  return rows;
}

export async function getHeaders(tab: SheetTab) {
  const sheets = await getSheetsClient();
  const response = await withReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: getSpreadsheetId(), range: `'${tab}'!1:1` }));
  return (response.data.values?.[0] ?? []).map(String);
}

export async function appendRecord(tab: SheetTab, record: Record<string, string | number>) {
  const headers = await getHeaders(tab);
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(), range: `'${tab}'!A:ZZ`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
    requestBody: { values: [headers.map(header => record[header] ?? "")] },
  });
}

export async function appendRecordToDataRegion(tab: SheetTab, record: Record<string, string | number>) {
  const headers = await getHeaders(tab);
  const sheets = await getSheetsClient();
  const response = await withReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: getSpreadsheetId(), range: `'${tab}'!A:ZZ` }));
  const values = response.data.values ?? [];
  let rowNumber = 2;
  for (let index = 1; index < values.length; index++) {
    const cells = values[index] ?? [];
    if (!cells.some(cell => String(cell ?? "").trim() !== "")) break;
    rowNumber = index + 2;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSpreadsheetId(),
    range: `'${tab}'!A${rowNumber}:${columnName(headers.length)}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers.map(header => record[header] ?? "")] },
  });
  return rowNumber;
}

export async function appendRecordsToDataRegions(appends: Array<{ tab: SheetTab; record: Record<string, string | number> }>) {
  if (!appends.length) return [];
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const tabs = [...new Set(appends.map(item => item.tab))];
  const tableState = new Map<SheetTab, { headers: string[]; nextRowNumber: number }>();
  await Promise.all(tabs.map(async tab => {
    const headers = await getHeaders(tab);
    const response = await withReadRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A:ZZ` }));
    const values = response.data.values ?? [];
    let nextRowNumber = 2;
    for (let index = 1; index < values.length; index++) {
      const cells = values[index] ?? [];
      if (!cells.some(cell => String(cell ?? "").trim() !== "")) break;
      nextRowNumber = index + 2;
    }
    tableState.set(tab, { headers, nextRowNumber });
  }));
  const ranges: Array<{ tab: SheetTab; rowNumber: number }> = [];
  const data = appends.map(append => {
    const state = tableState.get(append.tab);
    if (!state) throw new Error(`${append.tab} table state is unavailable`);
    const rowNumber = state.nextRowNumber++;
    ranges.push({ tab: append.tab, rowNumber });
    return { range: `'${append.tab}'!A${rowNumber}:${columnName(state.headers.length)}${rowNumber}`, values: [state.headers.map(header => append.record[header] ?? "")] };
  });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  return ranges;
}

export async function updateRecord(tab: SheetTab, rowNumber: number, patch: Record<string, string | number>) {
  const headers = await getHeaders(tab);
  const currentRows = await readSheet<Record<string, string>>(tab);
  const current = currentRows.find(row => row._rowNumber === rowNumber);
  if (!current) throw new Error(`${tab} row not found`);
  const values = headers.map(header => patch[header] ?? current[header] ?? "");
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.update({ spreadsheetId: getSpreadsheetId(), range: `'${tab}'!A${rowNumber}:${columnName(headers.length)}${rowNumber}`, valueInputOption: "USER_ENTERED", requestBody: { values: [values] } });
}

export async function updateConfigValue(key: string, value: string | number) {
  const rows = await readSheet<Record<string, string>>("System_Config");
  const row = rows.find(item => item.Config_Key === key);
  if (!row) throw new Error(`System configuration ${key} not found`);
  return updateRecord("System_Config", row._rowNumber, { Config_Value: value });
}

export async function atomicSheetMutation({ appends = [], updates = [] }: { appends?: Array<{ tab: SheetTab; record: Record<string, string | number> }>; updates?: Array<{ tab: SheetTab; rowNumber: number; patch: Record<string, string | number> }> }) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const metadata = await withReadRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" }));
  const sheetIds = new Map((metadata.data.sheets ?? []).map(sheet => [sheet.properties?.title ?? "", sheet.properties?.sheetId]));
  const tabs = [...new Set([...appends.map(item => item.tab), ...updates.map(item => item.tab)])];
  const headerEntries = await Promise.all(tabs.map(async tab => [tab, await getHeaders(tab)] as const));
  const headers = new Map(headerEntries);
  const requests: sheets_v4.Schema$Request[] = [];
  for (const append of appends) {
    const sheetId = sheetIds.get(append.tab); const tabHeaders = headers.get(append.tab);
    if (sheetId === undefined || !tabHeaders) throw new Error(`${append.tab} sheet metadata is unavailable`);
    requests.push({ appendCells: { sheetId, fields: "userEnteredValue", rows: [{ values: tabHeaders.map(header => cellData(append.record[header] ?? "")) }] } });
  }
  for (const update of updates) {
    const sheetId = sheetIds.get(update.tab); const tabHeaders = headers.get(update.tab);
    if (sheetId === undefined || !tabHeaders) throw new Error(`${update.tab} sheet metadata is unavailable`);
    for (const [header, value] of Object.entries(update.patch)) {
      const column = tabHeaders.indexOf(header);
      if (column < 0) throw new Error(`${header} header not found in ${update.tab}`);
      requests.push({ updateCells: { range: { sheetId, startRowIndex: update.rowNumber - 1, endRowIndex: update.rowNumber, startColumnIndex: column, endColumnIndex: column + 1 }, fields: "userEnteredValue", rows: [{ values: [cellData(value)] }] } });
    }
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

export async function deleteSheetRowsInOrder(deletions: Array<{ tab: SheetTab; rowNumbers: number[] }>) {
  const sheets = await getSheetsClient(); const spreadsheetId = getSpreadsheetId();
  const metadata = await withReadRetry(() => sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(sheetId,title)" }));
  const sheetIds = new Map((metadata.data.sheets ?? []).map(sheet => [sheet.properties?.title ?? "", sheet.properties?.sheetId]));
  const requests: sheets_v4.Schema$Request[] = [];
  for (const deletion of deletions) {
    const sheetId = sheetIds.get(deletion.tab); if (sheetId === undefined) throw new Error(`${deletion.tab} sheet metadata is unavailable`);
    const rows = [...new Set(deletion.rowNumbers)].filter(rowNumber => Number.isInteger(rowNumber) && rowNumber > 1).sort((left, right) => right - left);
    for (const rowNumber of rows) requests.push({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } });
  }
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

function cellData(value: string | number): sheets_v4.Schema$CellData {
  return { userEnteredValue: typeof value === "number" ? { numberValue: value } : { stringValue: value } };
}

function columnName(count: number) {
  let value = count; let result = "";
  while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

async function withReadRetry<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!isTransientReadError(error) || attempt === 2) break;
      await delay(150 * (2 ** attempt) + Math.floor(Math.random() * 75));
    }
  }
  throw lastError;
}

function isTransientReadError(error: unknown) {
  const candidate = error as { code?: number | string; status?: number; message?: string };
  const status = Number(candidate?.code ?? candidate?.status ?? 0);
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(candidate?.message ?? "").toLowerCase();
  return message.includes("timeout") || message.includes("timed out") || message.includes("econnreset") || message.includes("socket hang up") || message.includes("temporarily unavailable");
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
