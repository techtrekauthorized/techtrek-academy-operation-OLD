import "server-only";
import { format, isValid, parse, parseISO } from "date-fns";
import { copyDocument, exportDocumentPdf, trashFile, uploadReceiptPdf } from "../google/drive";
import { assertDocumentPlaceholderResolved, replaceDocumentPlaceholders } from "../google/docs";
import { readSheet } from "../google/sheets";
import type { ReceiptGenerationInput, SystemConfigRow, UniversityRow } from "../types";
import { activeValue } from "./mappers";
import { googleWorkspaceError, ServiceError } from "./errors";
import { deliveryModeLabel } from "@/lib/delivery-mode";

export const RECEIPT_TEMPLATE_DOC_ID = "1B5Rm8qknVFAgK1Zzqg8FwXbQt1KHeOp5518DW_xatq0";

export async function getReceiptConfiguration() {
  const rows = await readSheet<SystemConfigRow>("System_Config");
  const values = Object.fromEntries(rows.map(row => [row.Config_Key, row.Config_Value]));
  for (const key of ["CURRENT_INTAKE", "RECEIPT_PREFIX", "NEXT_RECEIPT_SEQUENCE", "RECEIPT_TEMPLATE_DOC_ID"]) if (!values[key]) throw new ServiceError("CONFIG_MISSING", `${key} is not configured`, 500);
  const sequence = Number(values.NEXT_RECEIPT_SEQUENCE);
  if (!Number.isInteger(sequence) || sequence < 1) throw new ServiceError("CONFIG_INVALID", "NEXT_RECEIPT_SEQUENCE is invalid", 500);
  const sequenceRowNumber = rows.find(row => row.Config_Key === "NEXT_RECEIPT_SEQUENCE")?._rowNumber;
  if (!sequenceRowNumber) throw new ServiceError("CONFIG_MISSING", "NEXT_RECEIPT_SEQUENCE row is missing", 500);
  if (values.RECEIPT_TEMPLATE_DOC_ID !== RECEIPT_TEMPLATE_DOC_ID) throw new ServiceError("CONFIG_INVALID", "RECEIPT_TEMPLATE_DOC_ID does not match the approved receipt template", 500);
  return { currentIntake: values.CURRENT_INTAKE, prefix: values.RECEIPT_PREFIX, sequence, sequenceRowNumber, templateId: RECEIPT_TEMPLATE_DOC_ID };
}

export function receiptNumber(prefix: string, sequence: number, year = 2026) {
  const normalized = prefix.replace(/-+$/, "");
  return `${normalized}${normalized.includes(String(year)) ? "" : `-${year}`}-${String(sequence).padStart(4, "0")}`;
}

const money = (value: number) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
const receiptMoney = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? money(value) : "";
const EMPTY_RECEIPT_VALUE = "-";

function receiptPlaceholderValue(value: unknown) {
  if (value === null || value === undefined) return EMPTY_RECEIPT_VALUE;
  const text = String(value).trim();
  const normalized = text.toLowerCase();
  return !text || ["undefined", "null", "\u00e2\u20ac\u201d", "\u00e2\u20ac\u201c"].includes(normalized) ? EMPTY_RECEIPT_VALUE : text;
}

function receiptPlaceholders(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, receiptPlaceholderValue(value)]));
}

function receiptDate(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const isoDate = parseISO(text); if (isValid(isoDate)) return format(isoDate, "dd/MM/yyyy");
  for (const pattern of ["dd/MM/yyyy", "MM/dd/yyyy"]) { const parsed = parse(text, pattern, new Date()); if (isValid(parsed)) return format(parsed, "dd/MM/yyyy"); }
  return text;
}

export async function generateReceipt(input: ReceiptGenerationInput, templateId: string) {
  const universities = await readSheet<UniversityRow>("Universities");
  const folder = universities.find(row => activeValue(row.Is_Active) && row.University_Name.trim().toLowerCase() === input.programScope.trim().toLowerCase());
  if (!folder?.Receipts_Drive_Folder_ID) throw new ServiceError("DRIVE_FOLDER_ERROR", `Drive folder is not configured for ${input.programScope}`, 502);
  let temporaryDocId = ""; let pdfFileId = ""; let stage = "copying the Google Docs template";
  try {
    temporaryDocId = await copyDocument(templateId, `Temporary ${input.receiptNumber}`);
    stage = `replacing receipt template placeholders for payment ${input.paymentId} / receipt ${input.receiptNumber}`;
    await replaceDocumentPlaceholders(temporaryDocId, receiptPlaceholders({
      receipt_number: input.receiptNumber, date: receiptDate(input.paymentDate), status: input.paymentStatus,
      university: input.programScope, student_name: input.student.studentName, phone: input.student.phone, student_id: input.student.studentId,
      faculty: input.student.college, Gmail: input.student.email, department: input.student.department, track_name: input.enrollment.track,
      credit_hours: Number.isFinite(input.enrollment.exactHours) ? `${input.enrollment.exactHours} hrs` : "", required_amount: receiptMoney(input.remainingBefore), paid_amount: receiptMoney(input.paymentAmount),
      remaining_amount: receiptMoney(input.remainingAfter), payment_method: input.paymentMethod, receiver_name: input.receiverName, notes: input.notes || "—",
      Delivery_Mode: deliveryModeLabel(input.deliveryMode),
    }), { paymentId: input.paymentId, receiptNumber: input.receiptNumber });
    await assertDocumentPlaceholderResolved(temporaryDocId, "{{Delivery_Mode}}");
    stage = "exporting the receipt document as PDF";
    const pdf = await exportDocumentPdf(temporaryDocId);
    const safeName = input.student.studentName.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "");
    stage = `uploading the receipt PDF to the ${input.programScope} folder`;
    const uploaded = await uploadReceiptPdf(folder.Receipts_Drive_Folder_ID, `Receipt_${input.receiptNumber}_${safeName}.pdf`, pdf);
    pdfFileId = uploaded.fileId;
    await trashFile(temporaryDocId);
    return { ...uploaded, cleanup: async () => { try { await trashFile(uploaded.fileId); } catch { /* best-effort cleanup */ } } };
  } catch (error) {
    if (temporaryDocId) { try { await trashFile(temporaryDocId); } catch { /* best-effort cleanup */ } }
    if (pdfFileId) { try { await trashFile(pdfFileId); } catch { /* best-effort cleanup */ } }
    if (error instanceof ServiceError) throw error;
    throw googleWorkspaceError(error, stage);
  }
}
