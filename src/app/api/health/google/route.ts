import { NextResponse } from "next/server";
import { confirmDocument } from "@/lib/server/google/docs";
import { confirmDriveFolder, copyDocument, testFolderWritable, trashFile } from "@/lib/server/google/drive";
import { readSheet } from "@/lib/server/google/sheets";
import type { SystemConfigRow, TrackRow, UniversityRow } from "@/lib/server/types";
import { activeValue } from "@/lib/server/services/mappers";
import { RECEIPT_TEMPLATE_DOC_ID } from "@/lib/server/services/receipt-service";
import { safeGoogleDetails } from "@/lib/server/services/errors";
import { requireRole } from "@/lib/server/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(["ADMIN"]); if (auth.response) return auth.response;
  let sheetsConnected = false; let templateReadable = false; let templateCopyTest = false; let receiptFolderWritable = false; let safeError: { googleStatus: number; googleReason: string; stage: string } | undefined;
  let universities: Array<UniversityRow & { _rowNumber: number }> = [];
  try {
    const [config, tracks, universityRows] = await Promise.all([readSheet<SystemConfigRow>("System_Config"), readSheet<TrackRow>("Tracks"), readSheet<UniversityRow>("Universities")]);
    if (!config.length || !tracks.slice(0, 3).length) throw new Error("Required Sheet data is unavailable");
    universities = universityRows; sheetsConnected = true;
  } catch (error) { safeError = safeGoogleDetails(error, "reading Google Sheets with the service account"); }
  if (sheetsConnected) {
    try { await confirmDocument(RECEIPT_TEMPLATE_DOC_ID); templateReadable = true; }
    catch (error) { safeError ??= safeGoogleDetails(error, "reading the receipt template with OAuth"); }
    if (templateReadable) {
      let testCopyId = "";
      try { testCopyId = await copyDocument(RECEIPT_TEMPLATE_DOC_ID, `.techtrek-template-copy-test-${Date.now()}`); await trashFile(testCopyId); testCopyId = ""; templateCopyTest = true; }
      catch (error) { safeError ??= safeGoogleDetails(error, "copying the receipt template with OAuth"); if (testCopyId) { try { await trashFile(testCopyId); } catch { /* best effort */ } } }
    }
    const folderId = universities.find(row => activeValue(row.Is_Active) && row.Receipts_Drive_Folder_ID)?.Receipts_Drive_Folder_ID;
    if (folderId) {
      try { await confirmDriveFolder(folderId); await testFolderWritable(folderId); receiptFolderWritable = true; }
      catch (error) { safeError ??= safeGoogleDetails(error, "writing to the receipt folder with OAuth"); }
    } else safeError ??= { googleStatus: 0, googleReason: "folderNotConfigured", stage: "locating an active receipt folder" };
  }
  const ok = sheetsConnected && templateReadable && templateCopyTest && receiptFolderWritable;
  return NextResponse.json({ ok, sheets: sheetsConnected ? "connected" : "failed", docs: templateReadable && templateCopyTest ? "connected" : "failed", drive: receiptFolderWritable ? "connected" : "failed", sheetsAuth: "service-account", driveDocsAuth: "oauth-user", templateReadable, templateCopyTest, receiptFolderWritable, ...(safeError ? { error: `Google integration failed while ${safeError.stage} (${safeError.googleStatus || "unknown"}: ${safeError.googleReason}).`, details: safeError } : {}) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
