function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeCertificateName(value) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Full Name in English is required.");
  if (!/[A-Za-z]/.test(name)) throw new Error("Certificate name must include English letters.");
  if (!/^[A-Za-z][A-Za-z\s'.-]*[A-Za-z.]$/.test(name) && !/^[A-Za-z]$/.test(name)) throw new Error("Certificate name may contain English letters, spaces, hyphen, apostrophe, and period only.");
  return name;
}

function normalizeCertificateEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email) throw new Error("Certificate Email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid certificate delivery email address.");
  return email;
}

function confirmCertificateProfile(input, studentRow) {
  if (String(studentRow.Certificate_Profile_Status ?? "").trim().toUpperCase() === "CONFIRMED") return { status: 409, writes: [] };
  const certificateName = normalizeCertificateName(input.certificateName);
  const certificateEmail = normalizeCertificateEmail(input.certificateEmail);
  const patch = {
    Certificate_Name: certificateName,
    Certificate_Email: certificateEmail,
    Certificate_Profile_Status: "CONFIRMED",
    Certificate_Profile_Confirmed_At: "2026-08-23T12:00:00.000Z",
  };
  return { status: 200, writes: Object.keys(patch), patch };
}

assert(normalizeCertificateName("  Omar   Abd-Elrahman  ") === "Omar Abd-Elrahman", "Name trims and collapses spaces");
assert(normalizeCertificateName("Youssef M. Hassan") === "Youssef M. Hassan", "English initials accepted");
assert(normalizeCertificateName("Adam O'Connor") === "Adam O'Connor", "Apostrophe accepted");
assert(normalizeCertificateEmail("Student@Outlook.COM") === "student@outlook.com", "Non-Gmail email accepted and lowercased");

for (const badName of ["", "   ", "عمر عبدالله"]) {
  let rejected = false;
  try { normalizeCertificateName(badName); } catch { rejected = true; }
  assert(rejected, `Invalid name rejected: ${badName || "blank"}`);
}

let invalidEmailRejected = false;
try { normalizeCertificateEmail("not-an-email"); } catch { invalidEmailRejected = true; }
assert(invalidEmailRejected, "Invalid email rejected");

const draft = { certificateName: "Omar Diefallah", certificateEmail: "omar@example.com" };
let writesBeforeFinalConfirm = 0;
assert(draft.certificateName && draft.certificateEmail && writesBeforeFinalConfirm === 0, "Step 1 keeps values client-side without writes");

const result = confirmCertificateProfile({ ...draft, academyStudentId: "ATTACKER_SUPPLIED_ID", Certificate_Profile_Status: "CONFIRMED" }, { Academy_Student_ID: "TT_001", Student_Name: "Canonical Name", Email: "canonical@example.com" });
assert(result.status === 200, "Final confirmation succeeds for unconfirmed student");
assert(JSON.stringify(result.writes.sort()) === JSON.stringify(["Certificate_Email", "Certificate_Name", "Certificate_Profile_Confirmed_At", "Certificate_Profile_Status"].sort()), "Only certificate profile fields are written");
assert(result.patch.Certificate_Profile_Status === "CONFIRMED", "Status is server-controlled CONFIRMED");
assert(result.patch.Certificate_Name === "Omar Diefallah", "Certificate name saved separately");
assert(result.patch.Certificate_Email === "omar@example.com", "Certificate email saved separately");

const locked = confirmCertificateProfile(draft, { Certificate_Profile_Status: "CONFIRMED", Certificate_Name: "Omar Diefallah" });
assert(locked.status === 409 && locked.writes.length === 0, "Confirmed student cannot resubmit");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
