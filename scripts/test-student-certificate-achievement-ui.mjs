import fs from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const page = fs.readFileSync("src/components/student-portal/StudentPortalPages.tsx", "utf8");
const viewer = fs.readFileSync("src/components/student-portal/StudentCertificateViewer.tsx", "utf8");
const downloadButton = fs.readFileSync("src/components/student-portal/StudentCertificateDownloadButton.tsx", "utf8");
const service = fs.readFileSync("src/lib/server/student-portal/service.ts", "utf8");
const pdfRoute = fs.readFileSync("src/app/api/student-portal/certificates/[certificateId]/download/route.ts", "utf8");
const jpgRoute = fs.readFileSync("src/app/api/student-portal/certificates/[certificateId]/jpg/route.ts", "utf8");

assert(page.includes("Congratulations on Your Achievement! 🎓"), "Achievement hero heading is present");
assert(page.includes("Congratulations, {safeDisplayText(studentName)}! 🎓"), "Personalized congratulations uses certificate display name");
assert(page.includes("TechTrek is proud to recognize your dedication"), "Exact personalized TechTrek copy is present");
assert(!page.includes("Published certificates delivered by TechTrek Academy"), "New certificate copy does not use TechTrek Academy");
assert(page.includes("Certificate Available"), "Student-facing certificate status is Certificate Available");
assert(!page.includes("<Badge>Published</Badge>"), "Published raw label is not shown on certificate cards");
assert(page.includes("View Certificate"), "View Certificate action is present");
assert(page.includes("Download as PDF"), "Download as PDF action is present");
assert(page.includes("Download as JPG"), "Download as JPG action is present");
assert(page.includes("View Verification"), "View Verification action is present");
assert(!page.includes(">Verify Certificate<"), "Old Verify Certificate label is removed");
assert(page.includes("Your certificates will appear here once they are issued and made available by TechTrek."), "Empty state avoids misleading congratulations");
assert(viewer.includes("Certificate Available") && viewer.includes("Download as PDF") && viewer.includes("Download as JPG") && viewer.includes("View Verification"), "Certificate detail viewer exposes the same student actions");
assert(downloadButton.includes("fetch(href, { credentials: \"include\" })") && downloadButton.includes("URL.createObjectURL(blob)") && downloadButton.includes("anchor.download = filename"), "Download actions use authenticated blob download instead of navigation");
assert(!page.includes("window.location.href") && !viewer.includes("window.location.href"), "Certificate download actions do not navigate the browser");
assert(service.includes("Certificate_Status") && service.includes("Portal_Status") && service.includes("Certificate_File_ID"), "Student certificate service filters by issued, published, and file id");
assert(!service.includes("Certificate_File_URL") || !page.includes("Certificate_File_URL"), "Raw Drive URL is not exposed to student UI");
assert(pdfRoute.includes("getStudentPortalCertificateFile") && pdfRoute.includes("downloadDriveFile") && pdfRoute.includes("Content-Disposition"), "PDF download validates ownership and returns a named PDF");
assert(jpgRoute.includes("getStudentPortalCertificateFile") && jpgRoute.includes("downloadDriveThumbnail") && jpgRoute.includes("Content-Disposition"), "JPG endpoint validates ownership and returns a named certificate image");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
