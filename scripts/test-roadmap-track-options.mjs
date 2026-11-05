function bool(value) { return ["true", "yes", "1", "active"].includes(String(value ?? "").trim().toLowerCase()); }
function normalizeSpaces(value) { return String(value ?? "").trim().replace(/\s+/g, " "); }
function normalizeKey(value) { return normalizeSpaces(value).toLowerCase(); }
function numberValue(value) { const numeric = Number(String(value ?? "").replace(/,/g, "").trim()); return Number.isFinite(numeric) ? numeric : 0; }
function rank(option) { return (option.isActive ? 0 : 1000) + (option.trackName ? 0 : 100) + (option.exactHours ? 0 : 10); }
function buildOptions(rows) {
  const byTrackId = new Map();
  let conflicts = 0;
  for (const row of rows) {
    const trackId = normalizeSpaces(row.Track_ID);
    const trackName = normalizeSpaces(row.Track);
    if (!trackId || !trackName) continue;
    const exactHours = numberValue(row.Exact_Hours);
    const option = { trackId, trackName, university: normalizeSpaces(row.University), exactHours, isActive: bool(row.Is_Active), label: `${trackName} (${exactHours}H)` };
    const signature = [normalizeKey(option.trackName), option.exactHours, normalizeKey(option.university), normalizeKey(row.Offering_Type), normalizeKey(row.Package_Label), option.isActive ? "active" : "inactive"].join("|");
    const variantLabel = [normalizeSpaces(row.Offering_Type).replace(/_/g, " "), normalizeSpaces(row.Package_Label), option.university].filter(Boolean).join(" — ");
    const existing = byTrackId.get(trackId);
    if (!existing) byTrackId.set(trackId, { option, signature, labelKey: normalizeKey(option.label), variantLabel });
    else if (existing.signature !== signature) {
      conflicts++;
      if (rank(option) < rank(existing.option)) byTrackId.set(trackId, { option, signature, labelKey: normalizeKey(option.label), variantLabel });
    }
  }
  const byLabel = new Map();
  for (const entry of byTrackId.values()) {
    byLabel.set(entry.labelKey, [...(byLabel.get(entry.labelKey) ?? []), entry]);
  }
  const options = [];
  for (const entries of byLabel.values()) {
    const bySignature = new Map();
    for (const entry of entries) bySignature.set(entry.signature, [...(bySignature.get(entry.signature) ?? []), entry]);
    const canonicalEntries = [...bySignature.values()].map(signatureEntries => signatureEntries.sort((left, right) => rank(left.option) - rank(right.option) || left.option.trackId.localeCompare(right.option.trackId))[0]);
    if (canonicalEntries.length === 1) options.push(canonicalEntries[0].option);
    else {
      const labelCounts = new Map();
      for (const entry of canonicalEntries) {
        const variant = entry.variantLabel || entry.option.trackId;
        const finalLabel = `${entry.option.label} — ${variant}`;
        labelCounts.set(finalLabel, (labelCounts.get(finalLabel) ?? 0) + 1);
        options.push({ ...entry.option, label: labelCounts.get(finalLabel) > 1 ? `${finalLabel} — ${entry.option.trackId}` : finalLabel });
      }
    }
  }
  return { options: options.sort((a, b) => a.trackName.localeCompare(b.trackName) || a.exactHours - b.exactHours || a.university.localeCompare(b.university) || a.trackId.localeCompare(b.trackId)), conflicts };
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const rows = [
  { Track_ID: " TRK_PEN ", Track: "Advanced Data Science", Exact_Hours: "64", University: "TechTrek", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "64H", Is_Active: "TRUE" },
  { Track_ID: "TRK_PEN", Track: "Advanced   Data Science", Exact_Hours: "64", University: "TechTrek", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "64H", Is_Active: "TRUE" },
  { Track_ID: "TRK_EQUIV", Track: "Advanced Data Science", Exact_Hours: "64", University: "TechTrek", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "64H", Is_Active: "TRUE" },
  { Track_ID: "TRK_UNI", Track: "Advanced Data Science", Exact_Hours: "64", University: "Partner University", Offering_Type: "UNIVERSITY_PROGRAM", Package_Label: "64H", Is_Active: "TRUE" },
  { Track_ID: "TRK_HYB", Track: "Advanced Data Science - Hybrid", Exact_Hours: "60", University: "TechTrek", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "60H", Is_Active: "TRUE" },
  { Track_ID: "TRK_ONL", Track: "Advanced Data Science - Online", Exact_Hours: "60", University: "TechTrek", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "60H", Is_Active: "TRUE" },
  { Track_ID: "TRK_120", Track: "Advanced Data Science", Exact_Hours: "120", University: "TechTrek", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "120H", Is_Active: "TRUE" },
  { Track_ID: "TRK_CONFLICT", Track: "Data", Exact_Hours: "60", University: "A", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "60H", Is_Active: "TRUE" },
  { Track_ID: "TRK_CONFLICT", Track: "Data", Exact_Hours: "120", University: "A", Offering_Type: "INTENSIVE_DIPLOMA", Package_Label: "120H", Is_Active: "TRUE" },
];
const result = buildOptions(rows);
const keys = result.options.map(option => option.trackId);
assert(new Set(keys).size === keys.length, "No duplicate React keys remain");
assert(new Set(result.options.map(option => option.label)).size === result.options.length, "Duplicate display labels collapse or become distinguishable");
assert(result.options.filter(option => option.trackName === "Advanced Data Science" && option.exactHours === 64 && option.university === "TechTrek").length === 1, "Equivalent same-label tracks collapse");
assert(result.options.some(option => option.trackId === "TRK_UNI" && option.label.includes("UNIVERSITY PROGRAM")), "Same-label different semantic variant preserved with distinguished label");
assert(result.options.some(option => option.trackId === "TRK_HYB"), "Hybrid variant preserved");
assert(result.options.some(option => option.trackId === "TRK_ONL"), "Online variant preserved");
assert(result.options.some(option => option.trackId === "TRK_120"), "120H variant preserved");
assert(result.conflicts === 1, "Conflicting duplicate Track_ID counted");
assert(keys[0] === [...keys].sort()[0] || result.options[0].trackName <= result.options.at(-1).trackName, "Sorting stable");

console.log(JSON.stringify({ ok: true, productionWrites: 0 }, null, 2));
