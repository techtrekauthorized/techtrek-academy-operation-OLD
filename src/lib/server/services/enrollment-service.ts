import "server-only";
import { appendRecord, atomicSheetMutation, readSheet, updateRecord } from "../google/sheets";
import { trashFile } from "../google/drive";
import type { EnrollmentDto, EnrollmentRow, PaymentReceiptRow, StudentRow, SystemConfigRow, TrackRow } from "../types";
import { activeValue, enrollmentDto, offeringDto, studentDto } from "./mappers";
import { ServiceError } from "./errors";
import { generateReceipt, getReceiptConfiguration } from "./receipt-service";
import { normalizeDeliveryMode } from "@/lib/delivery-mode";

export async function getOfferings() { return (await readSheet<TrackRow>("Tracks")).filter(row => activeValue(row.Is_Active)).map(offeringDto); }
export async function getOffering(id: string) { const row = (await readSheet<TrackRow>("Tracks")).find(item => item.Offering_ID === id && activeValue(item.Is_Active)); if (!row) throw new ServiceError("OFFERING_UNAVAILABLE", "Selected offering unavailable", 404); return offeringDto(row); }
export async function getCurrentIntake() { const row = (await readSheet<SystemConfigRow>("System_Config")).find(item => item.Config_Key === "CURRENT_INTAKE"); if (!row?.Config_Value) throw new ServiceError("CONFIG_MISSING", "CURRENT_INTAKE is not configured", 500); return row.Config_Value; }
export async function getEnrollment(id: string) { const row = (await readSheet<EnrollmentRow>("Enrollments")).find(item => item.Enrollment_ID === id); if (!row) throw new ServiceError("ENROLLMENT_NOT_FOUND", "Enrollment not found", 404); return { row, enrollment: enrollmentDto(row) }; }
export async function appendEnrollment(enrollment: EnrollmentDto) { await appendRecord("Enrollments", { Enrollment_ID: enrollment.enrollmentId, Registration_Date: enrollment.registrationDate, Academy_Student_ID: enrollment.academyStudentId, Intake: enrollment.intake, University: enrollment.programScope, Offering_ID: enrollment.offeringId, Package_Label: enrollment.packageLabel, Track: enrollment.track, "Credit Hours": enrollment.exactHours, Catalogue_Price: enrollment.cataloguePrice, Discount: enrollment.discount, Final_Contract_Price: enrollment.finalContractPrice, Total_Paid: enrollment.totalPaid, Remaining: enrollment.remaining, Payment_Status: enrollment.paymentStatus, Group_ID: "", Delivery_Mode: enrollment.deliveryMode, Enrollment_Status: enrollment.enrollmentStatus }); }
export async function updateEnrollmentFinancials(rowNumber: number, totalPaid: number, remaining: number, paymentStatus: string) { await updateRecord("Enrollments", rowNumber, { Total_Paid: totalPaid, Remaining: remaining, Payment_Status: paymentStatus }); }
export async function updateEnrollmentStatus(id: string, status: string) { const found = await getEnrollment(id); await updateRecord("Enrollments", found.row._rowNumber, { Enrollment_Status: status }); return { ...found.enrollment, enrollmentStatus: status }; }

export async function changeEnrollmentTrack(enrollmentId: string, newOfferingId: string, deliveryModeInput: "ONLINE" | "OFFLINE" | "HYBRID" | "UNASSIGNED") {
  const [{ row: enrollmentRow, enrollment }, offering, paymentRows, studentRows, config] = await Promise.all([
    getEnrollment(enrollmentId), getOffering(newOfferingId), readSheet<PaymentReceiptRow>("Payments_Receipts"), readSheet<StudentRow>("Students"), getReceiptConfiguration(),
  ]);
  if (offering.offeringId === enrollment.offeringId) throw new ServiceError("SAME_OFFERING", "Select a different active offering", 409);
  const deliveryMode = normalizeDeliveryMode(deliveryModeInput);
  const studentRow = studentRows.find(row => row.Academy_Student_ID === enrollment.academyStudentId);
  if (!studentRow) throw new ServiceError("STUDENT_NOT_FOUND", "Student not found", 404);
  const student = studentDto(studentRow);
  if (offering.offeringType === "UNIVERSITY_PROGRAM" && offering.university.trim().toLowerCase() !== student.university.trim().toLowerCase()) throw new ServiceError("OFFERING_UNAVAILABLE", "The selected university offering does not match the student's real university", 409);

  const programScope = offering.offeringType === "INTENSIVE_DIPLOMA" ? "Intensive Diploma" : offering.university;
  const finalContractPrice = Math.max(0, offering.price - enrollment.discount);
  const remaining = Math.max(0, finalContractPrice - enrollment.totalPaid);
  const creditDue = Math.max(0, enrollment.totalPaid - finalContractPrice);
  const paymentStatus = remaining === 0 ? "Fully Paid" : "Partially Paid";
  const proposedEnrollment: EnrollmentDto = { ...enrollment, programScope, offeringId: offering.offeringId, packageLabel: offering.packageLabel, track: offering.track, exactHours: offering.exactHours, cataloguePrice: offering.price, finalContractPrice, remaining, paymentStatus, groupId: "", levelSelection: "", deliveryMode };
  const payments = paymentRows.filter(row => row.Enrollment_ID === enrollment.enrollmentId).sort((left, right) => {
    const leftTime = Date.parse(left.Payment_Date); const rightTime = Date.parse(right.Payment_Date);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    return left._rowNumber - right._rowNumber;
  });
  if (payments.some(payment => !payment.Receipt_Number.trim())) throw new ServiceError("RECEIPT_REISSUE_FAILED", "Every existing payment must have a receipt number before changing track", 409);

  const replacements: Array<{ payment: PaymentReceiptRow & { _rowNumber: number }; generated: Awaited<ReturnType<typeof generateReceipt>>; totalPaidAfter: number; remainingAfter: number }> = [];
  let totalPaidBefore = 0;
  try {
    for (let index = 0; index < payments.length; index++) {
      const payment = payments[index]; const paymentAmount = Number(String(payment.Payment_Amount).replace(/,/g, "")) || 0;
      const totalPaidAfter = totalPaidBefore + paymentAmount;
      const receiptRemainingBefore = Math.max(0, finalContractPrice - totalPaidBefore);
      const receiptRemainingAfter = Math.max(0, finalContractPrice - totalPaidAfter);
      const receiptStatus = receiptRemainingAfter === 0 ? "Fully Paid" : "Partially Paid";
      const creditNote = creditDue > 0 && index === payments.length - 1 ? `Program transfer credit: EGP ${creditDue.toFixed(2)}\nThe excess amount is due to the student as a refund or credit balance.` : "";
      const receiptNotes = [payment.Notes.trim(), creditNote].filter(Boolean).join("\n");
      const generated = await generateReceipt({ paymentId: payment.Payment_ID, receiptNumber: payment.Receipt_Number, paymentDate: payment.Payment_Date, paymentStatus: receiptStatus, programScope, student, enrollment: proposedEnrollment, deliveryMode, remainingBefore: receiptRemainingBefore, paymentAmount, remainingAfter: receiptRemainingAfter, paymentMethod: payment.Payment_Method, receiverName: payment.Receiver_Name, notes: receiptNotes }, config.templateId);
      replacements.push({ payment, generated, totalPaidAfter, remainingAfter: receiptRemainingAfter });
      totalPaidBefore = totalPaidAfter;
    }
  } catch (error) {
    await Promise.allSettled(replacements.map(item => item.generated.cleanup()));
    throw error;
  }

  try {
    await atomicSheetMutation({ updates: [
      { tab: "Enrollments", rowNumber: enrollmentRow._rowNumber, patch: { University: programScope, Offering_ID: offering.offeringId, Package_Label: offering.packageLabel, Track: offering.track, "Credit Hours": offering.exactHours, Catalogue_Price: offering.price, Final_Contract_Price: finalContractPrice, Remaining: remaining, Payment_Status: paymentStatus, Delivery_Mode: deliveryMode, Group_ID: "", Level_Selection: "", Entered_WhatsApp_Group: "FALSE" } },
      ...replacements.flatMap(item => [
        { tab: "Payments_Receipts" as const, rowNumber: item.payment._rowNumber, patch: { Receipt_Link: item.generated.link, Receipt_PDF_File_ID: item.generated.fileId, Receipt_Status: "Generated" } as Record<string, string | number> },
        { tab: "Payments_Receipts" as const, rowNumber: item.payment._rowNumber, patch: { Total_Paid_After_Payment: item.totalPaidAfter, Remaining_After_Payment: item.remainingAfter } as Record<string, string | number> },
      ]),
    ] });
  } catch {
    await Promise.allSettled(replacements.map(item => item.generated.cleanup()));
    console.error("Change Track failed while updating enrollment and payment snapshots", { enrollmentId });
    throw new ServiceError("TRACK_CHANGE_UPDATE_FAILED", "Change Track could not finalize the enrollment and payment financial snapshots", 502);
  }

  for (const { payment } of replacements) {
    if (payment.Receipt_Source === "GOOGLE_DOCS" && payment.Receipt_PDF_File_ID) {
      try { await trashFile(payment.Receipt_PDF_File_ID); }
      catch { console.warn(`Track change completed, but old receipt cleanup failed for payment ${payment.Payment_ID}`); }
    }
  }
  return { enrollment: proposedEnrollment, creditDue, reissuedReceiptCount: replacements.length };
}
