import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());

const spreadsheetId = process.env.GOOGLE_SHEET_ID;
const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
if (!spreadsheetId || !encoded) throw new Error("Google Sheets environment is not configured");

const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
const sheets = google.sheets({ version: "v4", auth });
const deliveryHeaders = ["Certificate_File_URL", "Certificate_File_ID", "Certificate_File_Name", "Portal_Status", "Published_At", "Published_By"];

const response = await sheets.spreadsheets.values.get({
  spreadsheetId,
  range: "'Certificates'!A:ZZ",
  valueRenderOption: "UNFORMATTED_VALUE",
  dateTimeRenderOption: "SERIAL_NUMBER",
});

const values = response.data.values ?? [];
const headers = (values[0] ?? []).map(value => String(value ?? "").trim());
const rows = values.slice(1).filter(row => row.some(cell => String(cell ?? "").trim()));
const index = Object.fromEntries(headers.map((header, idx) => [header, idx]));
const missingDeliveryHeaders = deliveryHeaders.filter(header => !headers.includes(header));
const publishedRows = rows.filter(row => String(row[index.Portal_Status] ?? "").trim().toUpperCase() === "PUBLISHED");
const issuedRows = rows.filter(row => String(row[index.Certificate_Status] ?? "").trim().toUpperCase() === "ISSUED");
const publishedWithFileId = publishedRows.filter(row => String(row[index.Certificate_File_ID] ?? "").trim());

console.log(JSON.stringify({
  certificatesSheetDetected: true,
  deliveryHeadersDetected: missingDeliveryHeaders.length === 0,
  missingDeliveryHeaders,
  certificateRows: rows.length,
  issuedRows: issuedRows.length,
  publishedPortalRows: publishedRows.length,
  publishedRowsWithFileId: publishedWithFileId.length,
  productionWrites: 0,
}, null, 2));
