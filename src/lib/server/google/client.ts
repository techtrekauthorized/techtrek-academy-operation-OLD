import "server-only";
import { google, type docs_v1, type drive_v3, type sheets_v4 } from "googleapis";

const sheetsScopes = ["https://www.googleapis.com/auth/spreadsheets"];
export const oauthScopes = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents"];

type GoogleAuthInstance = InstanceType<typeof google.auth.GoogleAuth>;
let sheetsAuthPromise: Promise<GoogleAuthInstance> | undefined;

function required(name: "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64" | "GOOGLE_SHEET_ID" | "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET" | "GOOGLE_OAUTH_REFRESH_TOKEN" | "GOOGLE_OAUTH_REDIRECT_URI") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getSpreadsheetId() { return required("GOOGLE_SHEET_ID"); }

async function getSheetsAuth() {
  if (!sheetsAuthPromise) sheetsAuthPromise = (async () => {
    let credentials: Record<string, unknown>;
    try { credentials = JSON.parse(Buffer.from(required("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"), "base64").toString("utf8")); }
    catch { throw new Error("Google service account configuration is invalid"); }
    return new google.auth.GoogleAuth({ credentials, scopes: sheetsScopes });
  })();
  return sheetsAuthPromise;
}

export async function getSheetsClient() {
  const auth = await getSheetsAuth();
  return google.sheets({ version: "v4", auth: auth as unknown as sheets_v4.Options["auth"] });
}

export function createOAuthClient(requireRefreshToken = true) {
  const client = new google.auth.OAuth2(required("GOOGLE_OAUTH_CLIENT_ID"), required("GOOGLE_OAUTH_CLIENT_SECRET"), required("GOOGLE_OAUTH_REDIRECT_URI"));
  if (requireRefreshToken) client.setCredentials({ refresh_token: required("GOOGLE_OAUTH_REFRESH_TOKEN") });
  return client;
}

export function getOAuthAuthorizationUrl(state: string) {
  return createOAuthClient(false).generateAuthUrl({ access_type: "offline", prompt: "consent", scope: oauthScopes, state, include_granted_scopes: true });
}

export async function exchangeOAuthCode(code: string) {
  const client = createOAuthClient(false);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return { client, refreshTokenReceived: Boolean(tokens.refresh_token) };
}

export async function verifyOAuthConsentClient(client: InstanceType<typeof google.auth.OAuth2>) {
  const drive = google.drive({ version: "v3", auth: client as unknown as drive_v3.Options["auth"] });
  await drive.about.get({ fields: "user(permissionId)" });
}

export function hasConfiguredOAuthRefreshToken() { return Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN); }

export function getDriveDocsClients() {
  const auth = createOAuthClient(true);
  return {
    docs: google.docs({ version: "v1", auth: auth as unknown as docs_v1.Options["auth"] }),
    drive: google.drive({ version: "v3", auth: auth as unknown as drive_v3.Options["auth"] }),
  };
}
