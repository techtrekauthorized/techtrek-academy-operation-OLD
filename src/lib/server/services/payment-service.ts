import "server-only";
import { atomicSheetMutation, readSheet } from "../google/sheets";
import type { PaymentDto, PaymentInput, PaymentReceiptRow, StudentRow } from "../types";
import { getEnrollment } from "./enrollment-service";
import { nextPaymentId } from "./id-service";
import { paymentDto, studentDto } from "./mappers";
import { getReceiptConfiguration, generateReceipt, receiptNumber } from "./receipt-service";
import { ServiceError } from "./errors";
import { normalizeDeliveryMode } from "@/lib/delivery-mode";

export async function getPayments() { return (await readSheet<PaymentReceiptRow>("Payments_Receipts")).map(paymentDto); }
export async function getPayment(id: string) { const row = (await readSheet<PaymentReceiptRow>("Payments_Receipts")).find(item => item.Payment_ID === id); if (!row) throw new ServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404); return paymentDto(row); }

export function derivePaymentType(previousTotal: number, amount: number, remainingBefore: number) {
  if (previousTotal === 0 && amount === remainingBefore) return "Full Payment";
  if (amount === remainingBefore) return "Final Payment";
  if (previousTotal === 0) return "Deposit";
  return "Installment";
}

export async function createPayment(input: PaymentInput) {
  const [{ row: enrollmentRow, enrollment }, paymentRows, studentRows, config] = await Promise.all([getEnrollment(input.enrollmentId), readSheet<PaymentReceiptRow>("Payments_Receipts"), readSheet<StudentRow>("Students"), getReceiptConfiguration()]);
  if (enrollment.remaining <= 0 || enrollment.paymentStatus === "Fully Paid") throw new ServiceError("ALREADY_FULLY_PAID", "Enrollment is already fully paid");
  if (input.paymentAmount <= 0) throw new ServiceError("VALIDATION_FAILED", "Payment amount must be greater than zero");
  if (input.paymentAmount > enrollment.remaining) throw new ServiceError("PAYMENT_EXCEEDS_BALANCE", "Payment exceeds remaining balance");
  const studentRow = studentRows.find(row => row.Academy_Student_ID === enrollment.academyStudentId);
  if (!studentRow) throw new ServiceError("STUDENT_NOT_FOUND", "Student not found", 404);
  const student = studentDto(studentRow); const totalAfter = enrollment.totalPaid + input.paymentAmount; const remainingAfter = enrollment.finalContractPrice - totalAfter;
  const paymentStatus = remainingAfter === 0 ? "Fully Paid" : "Partially Paid"; const paymentType = derivePaymentType(enrollment.totalPaid, input.paymentAmount, enrollment.remaining);
  const id = nextPaymentId(paymentRows.map(row => row.Payment_ID)); const number = receiptNumber(config.prefix, config.sequence);
  const generated = await generateReceipt({ paymentId: id, receiptNumber: number, paymentDate: input.paymentDate, paymentStatus, programScope: enrollment.programScope, student, enrollment, deliveryMode: normalizeDeliveryMode(enrollment.deliveryMode), remainingBefore: enrollment.remaining, paymentAmount: input.paymentAmount, remainingAfter, paymentMethod: input.paymentMethod, receiverName: input.receiverName, notes: input.notes }, config.templateId);
  try {
    await atomicSheetMutation({ appends: [{ tab: "Payments_Receipts", record: { Payment_ID: id, Enrollment_ID: enrollment.enrollmentId, Academy_Student_ID: enrollment.academyStudentId, Payment_Date: input.paymentDate, Payment_Type: paymentType, Payment_Amount: input.paymentAmount, Total_Paid_After_Payment: totalAfter, Remaining_After_Payment: remainingAfter, Payment_Method: input.paymentMethod, Receipt_Number: number, Receipt_Status: "Generated", Receipt_Link: generated.link, Receiver_Name: input.receiverName, Notes: input.notes, Receipt_Source: "GOOGLE_DOCS", Receipt_PDF_File_ID: generated.fileId } }], updates: [{ tab: "Enrollments", rowNumber: enrollmentRow._rowNumber, patch: { Total_Paid: totalAfter, Remaining: remainingAfter, Payment_Status: paymentStatus } }, { tab: "System_Config", rowNumber: config.sequenceRowNumber, patch: { Config_Value: config.sequence + 1 } }] });
  } catch (error) { await generated.cleanup(); throw error; }
  return { paymentId: id, enrollmentId: enrollment.enrollmentId, academyStudentId: enrollment.academyStudentId, paymentDate: input.paymentDate, paymentType, paymentAmount: input.paymentAmount, totalPaidAfterPayment: totalAfter, remainingAfterPayment: remainingAfter, paymentMethod: input.paymentMethod, receiptNumber: number, receiptStatus: "Generated", receiptLink: generated.link, receiverName: input.receiverName, notes: input.notes, receiptSource: "GOOGLE_DOCS", receiptPdfFileId: generated.fileId } satisfies PaymentDto;
}
