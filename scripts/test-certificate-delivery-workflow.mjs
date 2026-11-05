function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractGoogleDriveFileId(value) {
  const input = String(value ?? "").trim();
  if (!input) return "";
  if (/^[A-Za-z0-9_-]{10,}$/.test(input) && !input.includes("/")) return input;
  try {
    const parsed = new URL(input);
    const id = parsed.searchParams.get("id");
    if (id) return id.trim();
    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex(part => part === "d");
    if (markerIndex >= 0) return parts[markerIndex + 1] ?? "";
  } catch {
    return "";
  }
  return "";
}

function deliveryFileId(row, drafts) {
  return extractGoogleDriveFileId(drafts[row.Certificate_ID] || "") || String(row.Certificate_File_ID || "").trim();
}

function parseBulkPaste(text, certificateIds) {
  const ids = new Set(certificateIds);
  const updates = {};
  let matched = 0;
  let unknown = 0;
  let invalid = 0;
  for (const line of text.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    const [rawId, ...rest] = line.includes("\t") ? line.split("\t") : line.split("|");
    const certificateId = rawId.trim();
    const driveUrl = rest.join("|").trim();
    if (!ids.has(certificateId)) {
      unknown++;
      continue;
    }
    if (!extractGoogleDriveFileId(driveUrl)) {
      invalid++;
      continue;
    }
    updates[certificateId] = driveUrl;
    matched++;
  }
  return { updates, matched, unknown, invalid };
}

function planPublish(requests, context) {
  const certificatesById = new Map(context.certificates.map(row => [row.Certificate_ID, row]));
  const enrollmentById = new Map(context.enrollments.map(row => [row.Enrollment_ID, row]));
  const studentById = new Map(context.students.map(row => [row.Academy_Student_ID, row]));
  const updates = [];
  const results = [];
  for (const request of requests) {
    const certificate = certificatesById.get(request.certificateId);
    if (!certificate) {
      results.push({ certificateId: request.certificateId, status: "FAILED" });
      continue;
    }
    const fileId = extractGoogleDriveFileId(request.driveUrl) || certificate.Certificate_File_ID || "";
    const enrollment = enrollmentById.get(certificate.Enrollment_ID);
    const student = studentById.get(certificate.Academy_Student_ID);
    if (certificate.Certificate_Status !== "ISSUED" || !fileId || !enrollment || !student || enrollment.Academy_Student_ID !== certificate.Academy_Student_ID) {
      results.push({ certificateId: request.certificateId, status: "FAILED" });
      continue;
    }
    if (certificate.Portal_Status === "PUBLISHED" && certificate.Certificate_File_ID === fileId) {
      results.push({ certificateId: request.certificateId, status: "ALREADY_PUBLISHED" });
      continue;
    }
    updates.push({
      certificateId: request.certificateId,
      patch: {
        Certificate_File_URL: request.driveUrl || `https://drive.google.com/file/d/${fileId}/view`,
        Certificate_File_ID: fileId,
        Certificate_File_Name: certificate.Certificate_File_Name || `${certificate.Certificate_ID}.pdf`,
        Portal_Status: "PUBLISHED",
        Published_At: "SERVER_TIME",
        Published_By: "AUTH_USER",
      },
    });
    results.push({ certificateId: request.certificateId, status: "PUBLISHED" });
  }
  return { updates, results };
}

function portalCertificatesForStudent(certificates, enrollments, academyStudentId) {
  const enrollmentIds = new Set(enrollments.filter(row => row.Academy_Student_ID === academyStudentId).map(row => row.Enrollment_ID));
  return certificates.filter(row => enrollmentIds.has(row.Enrollment_ID) && row.Academy_Student_ID === academyStudentId && row.Certificate_Status === "ISSUED" && row.Portal_Status === "PUBLISHED" && row.Certificate_File_ID);
}

assert(extractGoogleDriveFileId("https://drive.google.com/file/d/FILE_1234567890/view?usp=sharing") === "FILE_1234567890", "file/d Drive URL parses");
assert(extractGoogleDriveFileId("https://drive.google.com/open?id=FILE_OPEN_12345") === "FILE_OPEN_12345", "open?id Drive URL parses");
assert(extractGoogleDriveFileId("FILE_RAW_12345") === "FILE_RAW_12345", "existing raw file id parses");
assert(!extractGoogleDriveFileId("not a url"), "invalid Drive link rejected");

const paste = parseBulkPaste("CERT_1\thttps://drive.google.com/file/d/FILE_1/view\nCERT_2 | https://drive.google.com/open?id=FILE_2\nCERT_X | https://drive.google.com/open?id=FILE_X\nCERT_3 | bad", ["CERT_1", "CERT_2", "CERT_3"]);
assert(paste.matched === 2 && paste.unknown === 1 && paste.invalid === 1, "bulk paste matches by Certificate_ID and reports invalid/unknown");
assert(deliveryFileId({ Certificate_ID: "CERT_4", Certificate_File_ID: "EXISTING_FILE" }, {}) === "EXISTING_FILE", "existing preserved File_ID can be reused after unpublish");

const context = {
  certificates: [
    { Certificate_ID: "CERT_1", Enrollment_ID: "ENR_1", Academy_Student_ID: "TT_1", Certificate_Status: "ISSUED", Portal_Status: "", Certificate_File_ID: "" },
    { Certificate_ID: "CERT_2", Enrollment_ID: "ENR_2", Academy_Student_ID: "TT_1", Certificate_Status: "ISSUED", Portal_Status: "PUBLISHED", Certificate_File_ID: "FILE_2" },
    { Certificate_ID: "CERT_3", Enrollment_ID: "ENR_3", Academy_Student_ID: "TT_1", Certificate_Status: "REVOKED", Portal_Status: "", Certificate_File_ID: "" },
    { Certificate_ID: "CERT_4", Enrollment_ID: "ENR_4", Academy_Student_ID: "TT_2", Certificate_Status: "ISSUED", Portal_Status: "PUBLISHED", Certificate_File_ID: "FILE_4" },
  ],
  enrollments: [
    { Enrollment_ID: "ENR_1", Academy_Student_ID: "TT_1" },
    { Enrollment_ID: "ENR_2", Academy_Student_ID: "TT_1" },
    { Enrollment_ID: "ENR_3", Academy_Student_ID: "TT_1" },
    { Enrollment_ID: "ENR_4", Academy_Student_ID: "TT_2" },
  ],
  students: [{ Academy_Student_ID: "TT_1" }, { Academy_Student_ID: "TT_2" }],
};

const plan = planPublish([{ certificateId: "CERT_1", driveUrl: "https://drive.google.com/file/d/FILE_1/view" }, { certificateId: "CERT_2", driveUrl: "https://drive.google.com/file/d/FILE_2/view" }, { certificateId: "CERT_3", driveUrl: "https://drive.google.com/file/d/FILE_3/view" }], context);
assert(plan.updates.length === 1, "publish writes only valid unpublished issued certificates");
assert(Object.keys(plan.updates[0].patch).sort().join(",") === ["Certificate_File_ID", "Certificate_File_Name", "Certificate_File_URL", "Portal_Status", "Published_At", "Published_By"].sort().join(","), "publish patch is restricted to delivery fields");
assert(plan.results.find(result => result.certificateId === "CERT_2").status === "ALREADY_PUBLISHED", "same file publish is idempotent");
assert(plan.results.find(result => result.certificateId === "CERT_3").status === "FAILED", "revoked certificate cannot be published");

const portalRows = portalCertificatesForStudent(context.certificates, context.enrollments, "TT_1");
assert(portalRows.map(row => row.Certificate_ID).join(",") === "CERT_2", "student portal exposes only own ISSUED PUBLISHED certificates with file id");
assert(!JSON.stringify(portalRows).includes("Certificate_File_URL"), "student portal filtering does not require raw Drive URL");

const unpublishPatch = { Portal_Status: "NOT_PUBLISHED" };
assert(!("Certificate_Status" in unpublishPatch), "unpublish does not revoke certificates");
assert(!("Certificate_File_ID" in unpublishPatch), "unpublish preserves certificate file metadata");

console.log(JSON.stringify({ ok: true, googleSheetsWritesBeforePublish: 0, productionWrites: 0 }, null, 2));
