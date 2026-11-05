import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = relativePath => readFileSync(join(root, relativePath), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const service = read("src/lib/server/services/student-service.ts");
const component = read("src/components/students/StudentsPages.tsx");
const types = read("src/lib/server/types.ts");

assert(service.includes('readSheetDataRegion<CertificateRow>("Certificates")'), "Registry must load Certificates once with the main registry data.");
assert(service.includes("certificatesByEnrollmentId"), "Registry must index certificates by Enrollment_ID.");
assert(service.includes("textKey(certificate.Enrollment_ID)"), "Certificate matching must use Certificates.Enrollment_ID.");
assert(service.includes('text(row.Certificate_Status).toUpperCase() === "ISSUED"'), "ISSUED certificate state is not derived.");
assert(service.includes('text(row.Certificate_Status).toUpperCase() === "REVOKED"'), "REVOKED certificate state is not preserved.");
assert(service.includes('text(issued.Portal_Status).toUpperCase() === "PUBLISHED"'), "Delivered state must use Portal_Status = PUBLISHED.");

assert(types.includes('RegistryCertificateStatus = "ISSUED" | "NOT_ISSUED" | "REVOKED"'), "Registry certificate status type is missing.");
assert(types.includes('RegistryCertificateDeliveryStatus = "DELIVERED" | "NOT_DELIVERED"'), "Registry certificate delivery type is missing.");

assert(component.includes('"certificateStatus"') && component.includes('"certificateDelivery"'), "Certificate filters are not part of registry filters.");
assert(component.includes("All Certificate Statuses"), "Certificate Status filter all-label missing.");
assert(component.includes("All Delivery Statuses"), "Certificate Delivery filter all-label missing.");
assert(component.includes("filterMatchesAny(row.certificateStatus, filters.certificateStatus)"), "Certificate Status filter is not applied.");
assert(component.includes("filterMatchesAny(row.certificateDeliveryStatus, filters.certificateDelivery)"), "Certificate Delivery filter is not applied.");
assert(component.includes("Certificate Operations Summary"), "Certificate KPI section missing.");
assert(component.includes("Certificates Issued") && component.includes("Certificates Delivered") && component.includes("Remaining"), "Required certificate KPI cards missing.");
assert(component.includes("certificateSummaryRows = useMemo(() => rows.filter(rowMatchesSearchAndBaseFilters)"), "Certificate KPI summary should ignore certificate filters while respecting base filters/search.");
assert(component.includes("certificateStatusTone(row.certificateStatus)"), "Certificate status badges are not rendered.");

console.log("Student registry certificate filter checks passed.");
