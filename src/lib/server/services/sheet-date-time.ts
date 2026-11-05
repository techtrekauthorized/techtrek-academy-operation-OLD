const SPREADSHEET_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

export type SheetDateTimeRole = "date" | "time" | "dateTime";

export function normalizeSheetDate(value: unknown) {
  const serial = numericValue(value);
  if (serial !== undefined && serial >= 40000 && serial <= 60000) return serialToDate(serial);
  const raw = text(value);
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso && validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return raw;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = Number(slash[3]);
    if (validDateParts(year, month, day)) return `${year}-${pad2(month)}-${pad2(day)}`;
  }
  return "";
}

export function normalizeSheetTime(value: unknown) {
  const serial = numericValue(value);
  if (serial !== undefined && serial >= 0 && serial < 1) return minutesToTime(Math.round(serial * 24 * 60));
  const raw = text(value);
  if (!raw) return "";
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i.exec(raw);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (minute > 59) return "";
  if (meridiem) {
    if (hour < 1 || hour > 12) return "";
    if (hour === 12) hour = 0;
    if (meridiem === "PM") hour += 12;
  }
  if (hour > 23) return "";
  return `${pad2(hour)}:${pad2(minute)}`;
}

export function normalizeSheetDateTime(value: unknown) {
  const serial = numericValue(value);
  if (serial !== undefined && serial >= 40000 && serial <= 60001) {
    return `${serialToDate(serial)} ${serialToTime(serial)}`;
  }
  const raw = text(value);
  if (!raw) return "";
  const iso = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)$/i.exec(raw);
  if (iso) {
    const date = normalizeSheetDate(iso[1]);
    const timeValue = normalizeSheetTime(iso[2]);
    return date && timeValue ? `${date} ${timeValue}` : "";
  }
  const slash = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)$/i.exec(raw);
  if (slash) {
    const date = normalizeSheetDate(slash[1]);
    const timeValue = normalizeSheetTime(slash[2]);
    return date && timeValue ? `${date} ${timeValue}` : "";
  }
  return "";
}

export function normalizeSheetDateOrOriginal(value: unknown) {
  return normalizeSheetDate(value) || text(value);
}

export function normalizeSheetTimeOrOriginal(value: unknown) {
  return normalizeSheetTime(value) || text(value);
}

export function normalizeSheetDateTimeOrOriginal(value: unknown) {
  return normalizeSheetDateTime(value) || text(value);
}

export function normalizeAttendanceSessionDateFields<T extends Record<string, unknown>>(row: T): T {
  const normalized: Record<string, unknown> = { ...row };
  normalized.Session_Date = normalizeSheetDateOrOriginal(row.Session_Date);
  normalized.Start_Time = normalizeSheetTimeOrOriginal(row.Start_Time);
  normalized.End_Time = normalizeSheetTimeOrOriginal(row.End_Time);
  normalized.Open_From = normalizeSheetDateTimeOrOriginal(row.Open_From);
  normalized.Close_At = normalizeSheetDateTimeOrOriginal(row.Close_At);
  logInvalidSessionDateFields(row);
  return normalized as T;
}

export function normalizeBatchDateFields<T extends Record<string, unknown>>(row: T): T {
  return { ...row, Start_Date: normalizeSheetDateOrOriginal(row.Start_Date), End_Date: normalizeSheetDateOrOriginal(row.End_Date) } as T;
}

export function sortAttendanceSessions<T extends Record<string, unknown>>(rows: T[]) {
  return rows.slice().sort((left, right) =>
    text(left.Session_Date).localeCompare(text(right.Session_Date)) ||
    text(left.Start_Time).localeCompare(text(right.Start_Time)) ||
    numberValue(left.Session_Number) - numberValue(right.Session_Number) ||
    text(left.Attendance_Session_ID).localeCompare(text(right.Attendance_Session_ID)),
  );
}

export function getCairoNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function sheetDateTimeSortKey(date: unknown, timeValue: unknown) {
  return `${text(date)} ${text(timeValue)}`;
}

function serialToDate(serial: number) {
  const wholeDays = Math.floor(serial);
  const date = new Date(SPREADSHEET_EPOCH_UTC + wholeDays * DAY_MS);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function serialToTime(serial: number) {
  return minutesToTime(Math.round((serial - Math.floor(serial)) * 24 * 60));
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

function validDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value);
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function logInvalidSessionDateFields(source: Record<string, unknown>) {
  const fieldChecks: Array<[string, (value: unknown) => string]> = [
    ["Session_Date", normalizeSheetDate],
    ["Start_Time", normalizeSheetTime],
    ["End_Time", normalizeSheetTime],
    ["Open_From", normalizeSheetDateTime],
    ["Close_At", normalizeSheetDateTime],
  ];
  const invalidFields = fieldChecks.filter(([field, normalize]) => text(source[field]) && !normalize(source[field])).map(([field]) => field);
  if (invalidFields.length) {
    console.warn("attendance.session.invalidDateTime", { attendanceSessionId: text(source.Attendance_Session_ID), fields: invalidFields });
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}
