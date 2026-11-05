import type { PricingPlan } from "@/types";

type SourceRow = [universityOrScopeName: string, trackDisplayName: string, exactHours: number, listPrice: number];

// Static transcription of reference_data/tracks.xlsx. The workbook is not parsed at runtime.
const sourceRows: SourceRow[] = [
  ["Alexandria National University", "Advanced Data Science", 140, 3800],
  ["Alexandria National University", "Data Analysis & Business Intelligence", 120, 3500],
  ["Alexandria National University", "Artificial Intelligence(Ai)", 140, 3800],
  ["Alexandria National University", "Full Stack Web Development Diploma(Angular & .Net)", 140, 3500],
  ["Alexandria National University", "Flutter Development Diploma", 130, 3500],
  ["Alexandria National University", "Computer Vision", 120, 3500],
  ["Alexandria National University", "Automation (n8n)", 120, 3500],
  ["Alexandria National University", "Cyber Security (SOC)", 140, 4000],
  ["Alexandria National University", "Full Stack Web Development Diploma(React & Node Js)", 140, 3500],
  ["Alexandria National University", "Bug Bounty & Ethical Hacking", 140, 4000],
  ["Alexandria National University", "Penetration Testing", 140, 4000],
  ["Alexandria National University", "Advanced Data Science (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Data Analysis & Business Intelligence (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Artificial Intelligence(Ai) (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Frontend Development (Angular) (+60 hr.)", 60, 2000],
  ["Alexandria National University", "Frontend Development (React) (+60 hr.)", 60, 2000],
  ["Alexandria National University", "Backend Development (Node js) (+60 hr.)", 64, 2000],
  ["Alexandria National University", "Backend Development (.Net) (+60 hr.)", 64, 2000],
  ["Alexandria National University", "Flutter Development Diploma (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Computer Vision (+60 hr.)", 60, 2000],
  ["Alexandria National University", "Automation (n8n) (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Cyber Security (SOC) (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Bug Bounty & Ethical Hacking (+60 hr.)", 64, 2500],
  ["Alexandria National University", "Penetration Testing (+60 hr.)", 64, 2500],
  ["Alexandria University", "Advanced Data Science", 64, 1000],
  ["Alexandria University", "Data Analysis & Business Intelligence", 64, 1000],
  ["Alexandria University", "Artificial Intelligence(Ai)", 64, 1000],
  ["Alexandria University", "Frontend Development (Angular)", 60, 1000],
  ["Alexandria University", "Frontend Development (React)", 60, 1000],
  ["Alexandria University", "Backend Development (Node js)", 64, 1000],
  ["Alexandria University", "Backend Development (.Net)", 64, 1000],
  ["Alexandria University", "Flutter Development Diploma", 64, 1000],
  ["Alexandria University", "Computer Vision", 60, 1000],
  ["Alexandria University", "Automation (n8n)", 64, 1000],
  ["Alexandria University", "Software Testing", 64, 1000],
  ["Alexandria University", "Devops", 64, 1000],
  ["Alexandria University", "Bug Bounty & Ethical Hacking", 64, 1000],
  ["Alexandria University", "Cyber Security (SOC)", 64, 1000],
  ["Alexandria University", "Penetration Testing", 64, 1000],
  ["AIET", "Advanced Data Science (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Data Analysis & Business Intelligence (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Artificial Intelligence(Ai) (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Frontend Development (Angular) (60 Hrs. – 12 Days)", 60, 2000],
  ["AIET", "Frontend Development (React) (60 Hrs. – 12 Days)", 60, 2000],
  ["AIET", "Backend Development (Node js) (60 Hrs. – 12 Days)", 60, 2000],
  ["AIET", "Backend Development (.Net) (60 Hrs. – 12 Days)", 60, 2000],
  ["AIET", "Flutter Development Diploma (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Automation (n8n) (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Computer Vision (60 Hrs. – 12 Days)", 60, 2000],
  ["AIET", "Bug Bounty & Ethical Hacking (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Cyber Security (SOC) (60 Hrs. – 12 Days)", 60, 2500],
  ["AIET", "Advanced Data Science (120 Hrs. – 24 Days)", 120, 4000],
  ["AIET", "Data Analysis & Business Intelligence (120 Hrs. – 24 Days)", 120, 4000],
  ["AIET", "Artificial Intelligence(Ai) (120 Hrs. – 24 Days)", 120, 4500],
  ["AIET", "Flutter Development Diploma (120 Hrs. – 24 Days)", 120, 4000],
  ["AIET", "Full Stack (React & Node Js) (120 Hrs. – 24 Days)", 120, 4500],
  ["AIET", "Automation (n8n) (120 Hrs. – 24 Days)", 120, 3500],
  ["AIET", "Computer Vision (120 Hrs. – 24 Days)", 120, 3500],
  ["AIET", "Bug Bounty & Ethical Hacking (120 Hrs. – 24 Days)", 120, 5000],
  ["AIET", "Cyber Security (SOC) (120 Hrs. – 24 Days)", 120, 5000],
  ["Benha National University", "Advanced Data Science (+60 hr.)", 64, 2500],
  ["Benha National University", "Data Analysis & Business Intelligence (+60 hr.)", 64, 2500],
  ["Benha National University", "Artificial Intelligence(Ai) (+60 hr.)", 64, 2500],
  ["Benha National University", "Frontend Development (Angular) (+60 hr.)", 60, 2000],
  ["Benha National University", "Frontend Development (React) (+60 hr.)", 60, 2000],
  ["Benha National University", "Backend Development (Node js) (+60 hr.)", 64, 2000],
  ["Benha National University", "Backend Development (.Net) (+60 hr.)", 64, 2000],
  ["Benha National University", "Flutter Development Diploma (+60 hr.)", 64, 2000],
  ["Benha National University", "Computer Vision (+60 hr.)", 60, 2000],
  ["Benha National University", "Automation (n8n) (+60 hr.)", 64, 2000],
  ["Benha National University", "Cyber Security (SOC) (+60 hr.)", 64, 2500],
  ["Benha National University", "Bug Bounty & Ethical Hacking (+60 hr.)", 64, 2500],
  ["Benha National University", "Penetration Testing (+60 hr.)", 64, 2500],
  ["Benha National University", "Advanced Data Science", 120, 3500],
  ["Benha National University", "Data Analysis & Business Intelligence", 120, 3500],
  ["Benha National University", "Artificial Intelligence(Ai)", 120, 3500],
  ["Benha National University", "Full Stack Web Development Diploma(Angular & .Net)", 120, 3000],
  ["Benha National University", "Full Stack Web Development Diploma(React & Node Js)", 120, 3000],
  ["Benha National University", "Flutter Development Diploma", 120, 3000],
  ["Benha National University", "Computer Vision", 120, 3000],
  ["Benha National University", "Automation (n8n)", 120, 3000],
  ["Benha National University", "Cyber Security (SOC)", 120, 3500],
  ["Benha National University", "Bug Bounty & Ethical Hacking", 120, 3500],
  ["Benha National University", "Penetration Testing", 120, 3500],
  ["Intensive Diploma", "Advanced Data Science", 140, 3800],
  ["Intensive Diploma", "Data Analysis & Business Intelligence", 120, 3500],
  ["Intensive Diploma", "Artificial Intelligence(Ai)", 140, 3800],
  ["Intensive Diploma", "Full Stack Web Development Diploma(Angular & .Net)", 140, 3500],
  ["Intensive Diploma", "Flutter Development Diploma", 130, 3500],
  ["Intensive Diploma", "Computer Vision", 120, 3500],
  ["Intensive Diploma", "Automation (n8n)", 120, 3500],
  ["Intensive Diploma", "Cyber Security (SOC)", 140, 4000],
  ["Intensive Diploma", "Full Stack Web Development Diploma(React & Node Js)", 140, 3500],
  ["Intensive Diploma", "Bug Bounty & Ethical Hacking", 140, 4000],
  ["Intensive Diploma", "Penetration Testing", 140, 4000],
];

function normalizeTrackName(displayName: string) {
  return displayName
    .replace(/\s*\(\+60 hr\.\)$/i, "")
    .replace(/\s*\((60|120) Hrs\. – (12|24) Days\)$/i, "")
    .replace(/\(Ai\)/gi, "AI")
    .replace(/Diploma/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function packageLabel(hours: number) {
  if (hours <= 64) return "Short Diploma";
  if (hours === 120) return "Professional Diploma";
  return "Intensive Diploma";
}

export const pricingCatalogue: PricingPlan[] = sourceRows.map(([scope, track, hours, price], index) => ({
  id: `PRICE-${String(index + 1).padStart(3, "0")}`,
  scopeType: scope === "Intensive Diploma" ? "PROGRAM_CATEGORY" : "UNIVERSITY",
  universityOrScopeName: scope,
  trackDisplayName: track,
  normalizedTrackName: normalizeTrackName(track),
  packageLabel: packageLabel(hours),
  exactHours: hours,
  durationDays: Math.ceil(hours / 5),
  listPrice: price,
  currency: "EGP",
  isActive: true,
  validFrom: "2026-01-01",
  validTo: null,
  lastUpdated: "2026-06-29",
}));

export const universityPricingPlans = pricingCatalogue.filter(plan => plan.scopeType === "UNIVERSITY");
export const pricingUniversities = [...new Set(universityPricingPlans.map(plan => plan.universityOrScopeName))];
export const pricingTracks = [...new Set(pricingCatalogue.map(plan => plan.normalizedTrackName))];
export const pricingExactHours = [...new Set(pricingCatalogue.map(plan => plan.exactHours))].sort((a, b) => a - b);

export function findPricingPlan(university: string, normalizedTrackName: string, exactHours: number) {
  return universityPricingPlans.find(plan => plan.universityOrScopeName === university && plan.normalizedTrackName === normalizedTrackName && plan.exactHours === exactHours && plan.isActive);
}
