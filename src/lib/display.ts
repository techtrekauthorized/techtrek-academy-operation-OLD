import type { ReactNode } from "react";

const EMPTY_DISPLAY = "-";

export function safeDisplayText(value: unknown, empty = EMPTY_DISPLAY) {
  const raw = String(value ?? "").trim();
  if (!raw) return empty;
  const cleaned = raw
    .replace(/\u00c3[\u0080-\u00bf]*[\u00c2-\u00ff]*/g, " ")
    .replace(/Ãƒ[^\s|,-]*/g, " ")
    .replace(/Ã[^\s|,-]*/g, " ")
    .replace(/â€˜|â€™|â€œ|â€�|â€|â€š/g, "'")
    .replace(/â€”|â€“|â€-|\u2014|\u2013|\u2212/g, " - ")
    .replace(/Â·|Â|\u00b7|\u2022/g, " | ")
    .replace(/\uFFFD/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s*-\s*/g, " - ")
    .trim();
  if (!cleaned || cleaned === "|" || cleaned === "-") return empty;
  return cleaned;
}

export function readableEnum(value: unknown, empty = EMPTY_DISPLAY) {
  const cleaned = safeDisplayText(value, "");
  if (!cleaned) return empty;
  return cleaned.toLowerCase().split("_").map(word => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

export function joinDisplay(separator: " - " | " | ", ...values: unknown[]) {
  const parts = values.map(value => safeDisplayText(value, "")).filter(Boolean);
  return parts.length ? parts.join(separator) : EMPTY_DISPLAY;
}

export function packageHoursLabel(packageLabel: unknown, hours: unknown) {
  return joinDisplay(" - ", packageLabel, hours === null || hours === undefined || String(hours).trim() === "" ? "" : `${safeDisplayText(hours)}H`);
}

export function displayNode(value: ReactNode): ReactNode {
  if (typeof value === "string" || typeof value === "number") return safeDisplayText(value);
  if (Array.isArray(value)) return value.map(item => displayNode(item));
  return value;
}
