import type { PricingPlan } from "@/types";

// Frontend-only fixtures for the still-unconnected group module. Live offerings use /api/offerings.
export const pricingCatalogue: PricingPlan[] = [
  { id: "MOCK-1", scopeType: "UNIVERSITY", universityOrScopeName: "Benha National University", trackDisplayName: "Cyber Security (SOC)", normalizedTrackName: "Cyber Security (SOC)", packageLabel: "Short Diploma", exactHours: 64, durationDays: 13, listPrice: 2500, currency: "EGP", isActive: true, validFrom: "2026-01-01", validTo: null, lastUpdated: "2026-07-03" },
  { id: "MOCK-2", scopeType: "UNIVERSITY", universityOrScopeName: "Benha National University", trackDisplayName: "Artificial Intelligence AI", normalizedTrackName: "Artificial Intelligence AI", packageLabel: "Professional Diploma", exactHours: 120, durationDays: 24, listPrice: 3500, currency: "EGP", isActive: true, validFrom: "2026-01-01", validTo: null, lastUpdated: "2026-07-03" },
  { id: "MOCK-3", scopeType: "UNIVERSITY", universityOrScopeName: "AIET", trackDisplayName: "Advanced Data Science", normalizedTrackName: "Advanced Data Science", packageLabel: "Short Diploma", exactHours: 60, durationDays: 12, listPrice: 2500, currency: "EGP", isActive: true, validFrom: "2026-01-01", validTo: null, lastUpdated: "2026-07-03" },
];
export const pricingExactHours = [60, 64, 120, 130, 140];
export const pricingTracks = [...new Set(pricingCatalogue.map(plan => plan.normalizedTrackName))];
