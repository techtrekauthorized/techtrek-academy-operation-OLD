import nextEnv from "@next/env";
import { google } from "googleapis";

nextEnv.loadEnvConfig(process.cwd());
const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
const spreadsheetId = process.env.GOOGLE_SHEET_ID;
if (!encoded || !spreadsheetId) throw new Error("Google Sheets environment is not configured");
const credentials = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const sheets = google.sheets({ version: "v4", auth });
const values = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "'Users'!A:F" })).data.values ?? [];
const headers = values[0] ?? [];
const users = values.slice(1).map(row => Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "")])));
const active = users.filter(user => user.Is_Active.trim().toUpperCase() === "TRUE");
const results = {};
const baseUrl = process.env.AUTH_TEST_BASE_URL ?? "http://127.0.0.1:3011";

async function login(user, password = user.Password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user.Username, password }) });
  return { response, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

for (const role of ["SALES", "COORDINATOR", "ADMIN"]) {
  const user = active.find(candidate => candidate.Role.trim().toUpperCase() === role);
  if (!user) { results[role] = { existingActiveAccount: false }; continue; }
  const signedIn = await login(user);
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: signedIn.cookie } });
  const meBody = await me.json();
  const forbiddenApi = role === "ADMIN" ? null : await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: signedIn.cookie }, redirect: "manual" });
  const forbiddenPagePath = role === "SALES" ? "/settings" : role === "COORDINATOR" ? "/profitability" : null;
  const forbiddenPage = forbiddenPagePath ? await fetch(`${baseUrl}${forbiddenPagePath}`, { headers: { Cookie: signedIn.cookie }, redirect: "manual" }) : null;
  const allowedPage = await fetch(`${baseUrl}${role === "ADMIN" ? "/dashboard" : "/students"}`, { headers: { Cookie: signedIn.cookie }, redirect: "manual" });
  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: signedIn.cookie } });
  results[role] = {
    existingActiveAccount: true,
    loginStatus: signedIn.response.status,
    safeMeStatus: me.status,
    safeMeFieldsOnly: meBody.user ? Object.keys(meBody.user).sort().join(",") === "displayName,role,userId,username" : false,
    allowedPageStatus: allowedPage.status,
    forbiddenApiStatus: forbiddenApi?.status ?? "not-applicable",
    forbiddenPageRedirect: forbiddenPage ? [307, 308].includes(forbiddenPage.status) : "not-applicable",
    logoutStatus: logout.status,
  };
}

const firstActive = active[0];
if (firstActive) results.wrongPasswordStatus = (await login(firstActive, "__invalid_password_for_read_only_verification__")).response.status;
const inactive = users.find(user => user.Is_Active.trim().toUpperCase() !== "TRUE");
results.inactiveAccountStatus = inactive ? (await login(inactive)).response.status : "no-inactive-account-present";
results.unauthenticatedPageRedirect = [307, 308].includes((await fetch(`${baseUrl}/students`, { redirect: "manual" })).status);
results.unauthenticatedApiStatus = (await fetch(`${baseUrl}/api/students`)).status;
console.log(JSON.stringify(results, null, 2));
