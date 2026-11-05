import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
if (!spreadsheetId || !encoded) throw new Error("Google Sheets environment is not configured");

const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
let readCalls = 0;

const tabs = ["Assignments", "Assignment_Groups", "Assignment_Results", "Certificate_Eligibility", "Learning_Roadmaps", "Learning_Roadmap_Items", "Batch_Roadmaps", "Certificates", "Batches", "Groups", "Tracks"];
const headers = {
  Assignments: ["Assignment_ID", "Batch_ID", "Assignment_Type", "Title", "Description", "Level_Code", "Max_Grade", "Required_For_Certificate", "Show_On_Verification", "Verification_Order", "Is_Active", "Created_At", "Created_By", "Notes"],
  Assignment_Groups: ["Assignment_Group_Map_ID", "Assignment_ID", "Group_ID", "Is_Active", "Notes"],
  Assignment_Results: ["Assignment_Result_ID", "Assignment_ID", "Academy_Student_ID", "Enrollment_ID", "Group_ID", "Submission_Status", "Grade", "Graded_By", "Graded_At", "Notes", "Updated_At"],
  Certificate_Eligibility: ["Certificate_Eligibility_ID", "Academy_Student_ID", "Enrollment_ID", "Batch_ID", "Approval_Status", "Approved_By", "Approved_At", "Updated_At", "Notes"],
  Learning_Roadmaps: ["Roadmap_ID", "Track_ID", "Credit_Hours", "Roadmap_Name", "Version", "Is_Active", "Created_At", "Created_By", "Notes"],
  Learning_Roadmap_Items: ["Roadmap_Item_ID", "Roadmap_ID", "Section_Name", "Topic_Title", "Sort_Order", "Is_Active", "Notes"],
  Batch_Roadmaps: ["Batch_Roadmap_ID", "Batch_ID", "Group_ID", "Roadmap_ID", "Is_Active", "Assigned_At", "Assigned_By", "Notes"],
  Certificates: ["Certificate_ID", "Verification_Token", "Academy_Student_ID", "Enrollment_ID", "Batch_ID", "Roadmap_ID", "Certificate_Name", "Issue_Date", "Certificate_Status", "Issued_By", "Issued_At", "Revoked_By", "Revoked_At", "Notes"],
  Batches: ["Batch_ID", "Batch_Name", "Delivery_Track_ID", "Intake", "Start_Date", "End_Date", "Status", "Notes"],
  Groups: ["Group_ID", "Group_Name", "Batch_ID", "Level_Selection", "Level_1_Attendance_Mode", "Level_2_Attendance_Mode", "Capacity", "Status", "Notes"],
  Tracks: ["Track_ID", "Offering_ID", "University", "Offering_Type", "Track", "Package_Label", "Exact_Hours", "Duration_Days", "Price", "Is_Active"],
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function statusOf(error) { return Number(error?.response?.status ?? error?.code ?? error?.status ?? 0); }
async function withBackoff(operation) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (statusOf(error) !== 429 || attempt === 3) break;
      const retryAfter = Number(error?.response?.headers?.["retry-after"] ?? 0);
      await sleep((retryAfter > 0 ? retryAfter * 1000 : 2000 * (2 ** attempt)) + Math.floor(Math.random() * 500));
    }
  }
  throw lastError;
}
function rows(values = []) {
  const headerRow = (values[0] ?? []).map(value => String(value ?? "").trim());
  return values.slice(1).map((row, index) => ({ _rowNumber: index + 2, ...Object.fromEntries(headerRow.map((header, column) => [header, String(row[column] ?? "").trim()])) })).filter(row => Object.entries(row).some(([key, value]) => key !== "_rowNumber" && String(value).trim() !== ""));
}
function bool(value) { return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase()); }
function duplicateCount(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.values()].filter(value => value > 1).length;
}
function normalizeSpaces(value) { return String(value ?? "").trim().replace(/\s+/g, " "); }
function normalizeKey(value) { return normalizeSpaces(value).toLowerCase(); }
function numberValue(value) { const numeric = Number(String(value ?? "").replace(/,/g, "").trim()); return Number.isFinite(numeric) ? numeric : 0; }
function trackOptionRank(option) { return (option.isActive ? 0 : 1000) + (option.trackName ? 0 : 100) + (option.exactHours ? 0 : 10); }
function buildTrackDiagnostics(rows) {
  const byTrackId = new Map();
  const idCounts = new Map();
  const rawLabelCounts = new Map();
  let conflictingDuplicateTrackIds = 0;
  for (const row of rows) {
    const trackId = normalizeSpaces(row.Track_ID);
    const trackName = normalizeSpaces(row.Track);
    if (!trackId || !trackName) continue;
    const exactHours = row.Exact_Hours ? numberValue(row.Exact_Hours) : 0;
    const label = `${trackName} (${exactHours}H)`;
    const option = { trackId, trackName, university: normalizeSpaces(row.University), exactHours, isActive: bool(row.Is_Active), label };
    const signature = [normalizeKey(option.trackName), option.exactHours, normalizeKey(option.university), normalizeKey(row.Offering_Type), normalizeKey(row.Package_Label), option.isActive ? "active" : "inactive"].join("|");
    const variantLabel = [normalizeSpaces(row.Offering_Type).replace(/_/g, " "), normalizeSpaces(row.Package_Label), option.university].filter(Boolean).join(" — ");
    idCounts.set(trackId, (idCounts.get(trackId) ?? 0) + 1);
    rawLabelCounts.set(normalizeKey(label), (rawLabelCounts.get(normalizeKey(label)) ?? 0) + 1);
    const existing = byTrackId.get(trackId);
    if (!existing) byTrackId.set(trackId, { option, signature, labelKey: normalizeKey(label), variantLabel });
    else if (existing.signature !== signature) {
      conflictingDuplicateTrackIds++;
      if (trackOptionRank(option) < trackOptionRank(existing.option)) byTrackId.set(trackId, { option, signature, labelKey: normalizeKey(label), variantLabel });
    }
  }
  const byLabel = new Map();
  for (const entry of byTrackId.values()) {
    byLabel.set(entry.labelKey, [...(byLabel.get(entry.labelKey) ?? []), entry]);
  }
  const finalOptions = [];
  for (const entries of byLabel.values()) {
    const bySignature = new Map();
    for (const entry of entries) bySignature.set(entry.signature, [...(bySignature.get(entry.signature) ?? []), entry]);
    const canonicalEntries = [...bySignature.values()].map(signatureEntries => signatureEntries.sort((left, right) => trackOptionRank(left.option) - trackOptionRank(right.option) || left.option.trackId.localeCompare(right.option.trackId))[0]);
    if (canonicalEntries.length === 1) finalOptions.push(canonicalEntries[0].option);
    else {
      const labelCounts = new Map();
      for (const entry of canonicalEntries) {
        const variant = entry.variantLabel || entry.option.trackId;
        const finalLabel = `${entry.option.label} — ${variant}`;
        labelCounts.set(finalLabel, (labelCounts.get(finalLabel) ?? 0) + 1);
        finalOptions.push({ ...entry.option, label: labelCounts.get(finalLabel) > 1 ? `${finalLabel} — ${entry.option.trackId}` : finalLabel });
      }
    }
  }
  return {
    rawTrackRows: rows.length,
    uniqueTrackIds: idCounts.size,
    duplicateTrackIds: [...idCounts.values()].filter(count => count > 1).length,
    duplicateDisplayLabels: [...rawLabelCounts.values()].filter(count => count > 1).length,
    conflictingDuplicateTrackIds,
    finalRoadmapDropdownOptions: finalOptions.length,
  };
}

try {
  readCalls++;
  const response = await withBackoff(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map(tab => `'${tab}'!A:ZZ`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  }, { retry: false }));
  const raw = Object.fromEntries((response.data.valueRanges ?? []).map((range, index) => [tabs[index], range.values ?? []]));
  const headerStatus = Object.fromEntries(tabs.map(tab => {
    const actual = (raw[tab]?.[0] ?? []).map(value => String(value ?? "").trim());
    const mismatch = headers[tab].find((header, index) => actual[index] !== header);
    return [tab, mismatch ? { ok: false, expected: mismatch, actual: actual[headers[tab].indexOf(mismatch)] ?? "" } : { ok: true }];
  }));
  const data = Object.fromEntries(tabs.map(tab => [tab, rows(raw[tab] ?? [])]));
  const certificateHeaderRow = (raw.Certificates?.[0] ?? []).map(value => String(value ?? "").trim());
  const batches = new Set(data.Batches.map(row => row.Batch_ID));
  const groupsById = new Map(data.Groups.map(row => [row.Group_ID, row]));
  const activeBatchRoadmaps = data.Batch_Roadmaps.filter(row => bool(row.Is_Active));
  const trackDiagnostics = buildTrackDiagnostics(data.Tracks);
  console.log(JSON.stringify({
    readCalls,
    sheets: Object.fromEntries(tabs.map(tab => [tab, "DETECTED"])),
    headerStatus,
    rowCounts: Object.fromEntries(tabs.map(tab => [tab, data[tab].length])),
    duplicates: {
      assignmentIds: duplicateCount(data.Assignments, row => row.Assignment_ID),
      activeAssignmentGroupMappings: duplicateCount(data.Assignment_Groups.filter(row => bool(row.Is_Active)), row => `${row.Assignment_ID}:${row.Group_ID}`),
      resultPairs: duplicateCount(data.Assignment_Results, row => `${row.Assignment_ID}:${row.Enrollment_ID}`),
      eligibilityEnrollments: duplicateCount(data.Certificate_Eligibility, row => row.Enrollment_ID),
      certificateTokens: duplicateCount(data.Certificates, row => row.Verification_Token),
      activeBatchGroupRoadmaps: duplicateCount(activeBatchRoadmaps.filter(row => row.Batch_ID && row.Group_ID), row => `${row.Batch_ID}:${row.Group_ID}`),
    },
    blankGroupIdBatchRoadmaps: data.Batch_Roadmaps.filter(row => !row.Group_ID).length,
    unresolvedBatchRoadmaps: activeBatchRoadmaps.filter(row => !batches.has(row.Batch_ID) || !groupsById.has(row.Group_ID) || groupsById.get(row.Group_ID)?.Batch_ID !== row.Batch_ID).length,
    certificateSnapshotFields: {
      Student_Name_On_Certificate: certificateHeaderRow.includes("Student_Name_On_Certificate"),
      Certificate_Delivery_Email: certificateHeaderRow.includes("Certificate_Delivery_Email"),
    },
    trackDiagnostics,
    productionWrites: 0,
  }, null, 2));
} catch (error) {
  if (statusOf(error) === 429) {
    console.log(JSON.stringify({ readCalls, sheets: Object.fromEntries(tabs.map(tab => [tab, "RATE_LIMITED"])), headerStatus: "Not Verified", productionWrites: 0 }, null, 2));
  } else {
    throw error;
  }
}
