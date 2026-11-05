import "server-only";
import { Readable } from "node:stream";
import { getDriveDocsClients } from "./client";

export async function confirmDriveFolder(folderId: string) {
  const { drive } = getDriveDocsClients();
  await drive.files.get({ fileId: folderId, fields: "id,name,mimeType", supportsAllDrives: true });
}

export async function copyDocument(templateId: string, name: string) {
  const { drive } = getDriveDocsClients();
  const result = await drive.files.copy({ fileId: templateId, supportsAllDrives: true, requestBody: { name }, fields: "id" });
  if (!result.data.id) throw new Error("Google Docs template copy failed");
  return result.data.id;
}

export async function exportDocumentPdf(documentId: string) {
  const { drive } = getDriveDocsClients();
  const result = await drive.files.export({ fileId: documentId, mimeType: "application/pdf" }, { responseType: "arraybuffer" });
  return Buffer.from(result.data as ArrayBuffer);
}

export async function uploadReceiptPdf(folderId: string, name: string, pdf: Buffer) {
  const { drive } = getDriveDocsClients();
  const result = await drive.files.create({ supportsAllDrives: true, fields: "id,webViewLink,webContentLink", requestBody: { name, parents: [folderId], mimeType: "application/pdf" }, media: { mimeType: "application/pdf", body: Readable.from(pdf) } });
  if (!result.data.id) throw new Error("Receipt PDF upload failed");
  return { fileId: result.data.id, link: result.data.webViewLink ?? `https://drive.google.com/file/d/${result.data.id}/view`, downloadLink: result.data.webContentLink ?? "" };
}

export async function downloadDriveFile(fileId: string) {
  const { drive } = getDriveDocsClients();
  const response = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  return Buffer.from(response.data as ArrayBuffer);
}

export async function downloadDriveThumbnail(fileId: string, size = "w2400") {
  const { drive } = getDriveDocsClients();
  const metadata = await drive.files.get({ fileId, fields: "thumbnailLink", supportsAllDrives: true });
  const thumbnailLink = metadata.data.thumbnailLink;
  const url = thumbnailLink
    ? thumbnailLink.replace(/=s\d+(?:-[a-z]+)?/i, `=s${size.replace(/\D/g, "") || "2400"}`)
    : `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${encodeURIComponent(size)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Drive thumbnail download failed");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) throw new Error("Drive thumbnail response was not an image");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

export async function trashFile(fileId: string) {
  const { drive } = getDriveDocsClients();
  await drive.files.update({ fileId, supportsAllDrives: true, requestBody: { trashed: true } });
}

export async function testFolderWritable(folderId: string) {
  const { drive } = getDriveDocsClients();
  let fileId = "";
  try {
    const created = await drive.files.create({ supportsAllDrives: true, fields: "id", requestBody: { name: `.techtrek-write-test-${Date.now()}.txt`, parents: [folderId], mimeType: "text/plain" }, media: { mimeType: "text/plain", body: Readable.from(Buffer.from("TechTrek Google integration write test")) } });
    if (!created.data.id) throw new Error("Drive write test did not return a file ID");
    fileId = created.data.id;
  } finally {
    if (fileId) await trashFile(fileId);
  }
}
