export function extractGoogleDriveFileId(value: unknown) {
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

export function googleDrivePreviewUrl(fileId: unknown) {
  const id = String(fileId ?? "").trim();
  return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : "";
}

export function googleDriveDownloadUrl(fileId: unknown) {
  const id = String(fileId ?? "").trim();
  return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : "";
}
