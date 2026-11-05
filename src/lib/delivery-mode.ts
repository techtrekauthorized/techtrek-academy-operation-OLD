export const DELIVERY_MODE_OPTIONS = [
  { value: "ONLINE", label: "Online" },
  { value: "OFFLINE", label: "Offline" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "UNASSIGNED", label: "Not Decided Yet" },
] as const;

export type DeliveryModeValue = typeof DELIVERY_MODE_OPTIONS[number]["value"];

export function normalizeDeliveryMode(value: unknown): DeliveryModeValue {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized === "ONLINE" || normalized === "OFFLINE" || normalized === "HYBRID" || normalized === "UNASSIGNED" ? normalized : "UNASSIGNED";
}

export function deliveryModeLabel(value: unknown) {
  const normalized = normalizeDeliveryMode(value);
  return normalized === "ONLINE" ? "Online" : normalized === "OFFLINE" ? "Offline" : normalized === "HYBRID" ? "Hybrid" : "Unassigned";
}
