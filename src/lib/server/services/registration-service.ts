import "server-only";
import { atomicSheetMutation, readSheet } from "../google/sheets";
import type { EnrollmentDto, EnrollmentRow, PaymentReceiptRow, RegistrationInput, StudentDto, StudentRow } from "../types";
import { getCurrentIntake, getOffering } from "./enrollment-service";
import { nextEnrollmentId, nextPaymentId, nextStudentId } from "./id-service";
import { findStudent } from "./student-service";
import { getReceiptConfiguration, generateReceipt, receiptNumber } from "./receipt-service";
import { safeGoogleDetails, ServiceError } from "./errors";

export async function registerStudentEnrollment(input: RegistrationInput) {
  const [offering, intake, studentRows, enrollmentRows, paymentRows, config] = await Promise.all([getOffering(input.offeringId), getCurrentIntake(), readSheet<StudentRow>("Students"), readSheet<EnrollmentRow>("Enrollments"), readSheet<PaymentReceiptRow>("Payments_Receipts"), getReceiptConfiguration()]);
  let student: StudentDto; let existingStudentRowNumber: number | undefined; const isNew = input.mode === "new";
  if (isNew) {
    const duplicate = studentRows.find(row => (input.student.studentId && row.Student_ID.toLowerCase() === input.student.studentId.toLowerCase()) || (input.student.phone && row.Phone.replace(/\s/g, "") === input.student.phone.replace(/\s/g, "")));
    if (duplicate) throw new ServiceError("STUDENT_EXISTS", `An existing student matches ${duplicate.Academy_Student_ID}. Select Existing Student instead.`, 409);
    student = { ...input.student, academyStudentId: nextStudentId(studentRows.map(row => row.Academy_Student_ID)), studentStatus: "Active" };
  } else {
    if (!input.academyStudentId) throw new ServiceError("VALIDATION_FAILED", "Existing student must be selected");
    const found = await findStudent(input.academyStudentId);
    if (!found) throw new ServiceError("STUDENT_NOT_FOUND", "Student not found", 404);
    existingStudentRowNumber = found.row._rowNumber;
    student = { ...found.student, phone: input.student.phone, email: input.student.email, college: input.student.college, department: input.student.department, studentStatus: input.student.studentStatus, academyStudentId: found.student.academyStudentId };
  }
  if (offering.offeringType === "UNIVERSITY_PROGRAM" && student.university.trim().toLowerCase() !== offering.university.trim().toLowerCase()) throw new ServiceError("OFFERING_UNAVAILABLE", "Selected university offering does not match the student's real university", 409);
  if (enrollmentRows.some(row => row.Academy_Student_ID === student.academyStudentId && row.Intake === intake && row.Offering_ID === offering.offeringId)) throw new ServiceError("DUPLICATE_ENROLLMENT", "This student already has the selected offering in the current intake", 409);
  if (input.discount < 0 || input.discount > offering.price) throw new ServiceError("VALIDATION_FAILED", "Discount is outside the allowed contract range");
  if (input.discount > 0 && !input.discountReason.trim()) throw new ServiceError("VALIDATION_FAILED", "Discount reason is required");
  const finalPrice = Math.max(0, offering.price - input.discount);
  if (finalPrice > 0 && (input.openingPaymentAmount <= 0 || input.openingPaymentAmount > finalPrice)) throw new ServiceError("PAYMENT_EXCEEDS_BALANCE", "Opening payment must be greater than zero and cannot exceed the final contract price");
  if (finalPrice === 0 && input.openingPaymentAmount !== 0) throw new ServiceError("PAYMENT_EXCEEDS_BALANCE", "Opening payment must be zero when the final contract price is zero");
  const programScope = offering.offeringType === "INTENSIVE_DIPLOMA" ? "Intensive Diploma" : offering.university;
  const enrollment: EnrollmentDto = { enrollmentId: nextEnrollmentId(enrollmentRows.map(row => row.Enrollment_ID)), registrationDate: input.paymentDate, academyStudentId: student.academyStudentId, intake, programScope, offeringId: offering.offeringId, packageLabel: offering.packageLabel, track: offering.track, exactHours: offering.exactHours, cataloguePrice: offering.price, discount: input.discount, finalContractPrice: finalPrice, totalPaid: input.openingPaymentAmount, remaining: finalPrice - input.openingPaymentAmount, paymentStatus: input.openingPaymentAmount === finalPrice ? "Fully Paid" : "Partially Paid", groupId: "", deliveryMode: input.deliveryMode, enrollmentStatus: "Registered" };
  const paymentType = input.openingPaymentAmount === finalPrice ? "Full Payment" : "Deposit"; const paymentId = nextPaymentId(paymentRows.map(row => row.Payment_ID)); const number = receiptNumber(config.prefix, config.sequence);
  const generated = await generateReceipt({ paymentId, receiptNumber: number, paymentDate: input.paymentDate, paymentStatus: enrollment.paymentStatus, programScope, student, enrollment, deliveryMode: input.deliveryMode, remainingBefore: finalPrice, paymentAmount: input.openingPaymentAmount, remainingAfter: enrollment.remaining, paymentMethod: input.paymentMethod, receiverName: input.receiverName, notes: input.notes }, config.templateId);
  try {
    const studentRecord = { Academy_Student_ID: student.academyStudentId, Student_Name: student.studentName, Phone: student.phone, Email: student.email, University: student.university, College: student.college, Department: student.department, Student_ID: student.studentId, Student_Status: student.studentStatus };
    const enrollmentRecord = { Enrollment_ID: enrollment.enrollmentId, Registration_Date: enrollment.registrationDate, Academy_Student_ID: enrollment.academyStudentId, Intake: enrollment.intake, University: enrollment.programScope, Offering_ID: enrollment.offeringId, Package_Label: enrollment.packageLabel, Track: enrollment.track, "Credit Hours": enrollment.exactHours, Catalogue_Price: enrollment.cataloguePrice, Discount: enrollment.discount, Final_Contract_Price: enrollment.finalContractPrice, Total_Paid: enrollment.totalPaid, Remaining: enrollment.remaining, Payment_Status: enrollment.paymentStatus, Group_ID: "", Delivery_Mode: input.deliveryMode, Enrollment_Status: "Registered" };
    const paymentRecord = { Payment_ID: paymentId, Enrollment_ID: enrollment.enrollmentId, Academy_Student_ID: student.academyStudentId, Payment_Date: input.paymentDate, Payment_Type: paymentType, Payment_Amount: input.openingPaymentAmount, Total_Paid_After_Payment: input.openingPaymentAmount, Remaining_After_Payment: enrollment.remaining, Payment_Method: input.paymentMethod, Receipt_Number: number, Receipt_Status: "Generated", Receipt_Link: generated.link, Receiver_Name: input.receiverName, Notes: `${input.notes}${input.discountReason ? ` | Discount reason: ${input.discountReason}` : ""}`, Receipt_Source: "GOOGLE_DOCS", Receipt_PDF_File_ID: generated.fileId };
    await atomicSheetMutation({ appends: [...(isNew ? [{ tab: "Students" as const, record: studentRecord }] : []), { tab: "Enrollments", record: enrollmentRecord }, { tab: "Payments_Receipts", record: paymentRecord }], updates: [...(!isNew && existingStudentRowNumber ? [{ tab: "Students" as const, rowNumber: existingStudentRowNumber, patch: studentRecord }] : []), { tab: "System_Config", rowNumber: config.sequenceRowNumber, patch: { Config_Value: config.sequence + 1 } }] });
  } catch (error) {
    const details = safeGoogleDetails(error, "saving registration records");
    console.error("Registration write failure; reconciling generated IDs", { stage: details.stage, googleStatus: details.googleStatus, googleReason: details.googleReason, academyStudentId: student.academyStudentId, enrollmentId: enrollment.enrollmentId, paymentId, receiptNumber: number });
    let state: Awaited<ReturnType<typeof reconcileRegistrationWrite>>;
    try { state = await reconcileRegistrationWrite(student.academyStudentId, enrollment.enrollmentId, paymentId); }
    catch (reconcileError) {
      const reconcileDetails = safeGoogleDetails(reconcileError, "confirming registration write status");
      console.error("Registration reconciliation failed", { stage: reconcileDetails.stage, googleStatus: reconcileDetails.googleStatus, googleReason: reconcileDetails.googleReason, academyStudentId: student.academyStudentId, enrollmentId: enrollment.enrollmentId, paymentId, receiptNumber: number });
      throw new ServiceError("REGISTRATION_STATUS_UNKNOWN", "Registration status could not be confirmed after a Google Sheets error. Do not submit again; refresh the student profile or contact an administrator.", 502, reconcileDetails);
    }
    if (state.student && state.enrollment && state.payment) return registrationSuccess(student, enrollment, paymentId, paymentType, input.openingPaymentAmount, number, generated.link, generated.fileId);
    await generated.cleanup();
    if (state.student || state.enrollment || state.payment) throw new ServiceError("REGISTRATION_PARTIALLY_SAVED", "Registration records may have been partially saved, but the opening payment/receipt record was not fully confirmed. Do not submit again; refresh the student profile or contact an administrator.", 502, details);
    throw new ServiceError("REGISTRATION_SAVE_FAILED", "Registration could not be saved. Please try again after refreshing.", 502, details);
  }
  return registrationSuccess(student, enrollment, paymentId, paymentType, input.openingPaymentAmount, number, generated.link, generated.fileId);
}

async function reconcileRegistrationWrite(academyStudentId: string, enrollmentId: string, paymentId: string) {
  const [students, enrollments, payments] = await Promise.all([
    readSheet<StudentRow>("Students"),
    readSheet<EnrollmentRow>("Enrollments"),
    readSheet<PaymentReceiptRow>("Payments_Receipts"),
  ]);
  return {
    student: students.some(row => row.Academy_Student_ID === academyStudentId),
    enrollment: enrollments.some(row => row.Enrollment_ID === enrollmentId && row.Academy_Student_ID === academyStudentId),
    payment: payments.some(row => row.Payment_ID === paymentId && row.Enrollment_ID === enrollmentId && row.Academy_Student_ID === academyStudentId),
  };
}

function registrationSuccess(student: StudentDto, enrollment: EnrollmentDto, paymentId: string, paymentType: string, paymentAmount: number, receiptNumberValue: string, receiptLink: string, receiptPdfFileId: string) {
  return { student, enrollment, payment: { paymentId, paymentType, paymentAmount, remainingBalance: enrollment.remaining, receiptNumber: receiptNumberValue, receiptStatus: "Generated" as const, receiptSource: "GOOGLE_DOCS" as const, receiptLink, receiptPdfFileId, receiptDownloadLink: `/api/receipts/${encodeURIComponent(paymentId)}/download` } };
}
