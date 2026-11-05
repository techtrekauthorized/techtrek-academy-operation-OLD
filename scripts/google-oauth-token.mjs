import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import nextEnv from "@next/env";
import { google } from "googleapis";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (process.env.CI || process.env.VERCEL) {
  throw new Error("This OAuth helper is local-only and cannot run in CI or Vercel.");
}

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  throw new Error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in your local .env.local first.");
}

const host = "127.0.0.1";
const port = 3001;
const redirectUri = "http://localhost:3001/oauth2callback";
const state = randomBytes(32).toString("base64url");
const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authorizationUrl = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
  ],
  state,
  include_granted_scopes: true,
  login_hint: "techtrekadmin@gmail.com",
});

function stateMatches(received) {
  const expectedBuffer = Buffer.from(state);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function browserResponse(response, status, title, message) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  response.end(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;padding:40px"><h1>${title}</h1><p>${message}</p><p>You may close this window.</p></body></html>`);
}

let completed = false;
const server = http.createServer(async (request, response) => {
  if (completed) return browserResponse(response, 410, "OAuth session complete", "This one-time local OAuth session has already completed.");
  const url = new URL(request.url ?? "/", redirectUri);
  if (url.pathname !== "/oauth2callback") return browserResponse(response, 404, "Not found", "Only the OAuth callback path is available.");
  const receivedState = url.searchParams.get("state") ?? "";
  if (!receivedState || !stateMatches(receivedState)) return browserResponse(response, 400, "OAuth validation failed", "The OAuth state did not match. Stop the helper and start again.");
  if (url.searchParams.get("error")) return browserResponse(response, 400, "Authorization cancelled", "Google authorization was cancelled or denied.");
  const code = url.searchParams.get("code");
  if (!code) return browserResponse(response, 400, "Authorization failed", "Google did not return an authorization code.");
  completed = true;
  try {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Revoke the existing app grant and run this helper again.");
    browserResponse(response, 200, "Google authorization complete", "The refresh token was printed once in the local terminal. It was not sent to this browser page.");
    server.close(() => {
      console.log("\nCopy this value now. It will not be saved or printed again:\n");
      console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log("\nPlace it manually in .env.local and in Vercel Environment Variables.");
    });
  } catch (error) {
    completed = false;
    const missingRefreshToken = error instanceof Error && error.message.startsWith("Google did not return a refresh token");
    browserResponse(response, 500, "Token exchange failed", missingRefreshToken ? "Google did not return a refresh token. Revoke the existing app grant and run this helper again." : "The OAuth token exchange failed. Check the OAuth client configuration and run the helper again.");
  }
});

server.listen(port, host, () => {
  console.log(`Local OAuth callback listening at ${redirectUri}`);
  console.log("\nOpen this authorization URL and sign in as techtrekadmin@gmail.com:\n");
  console.log(authorizationUrl);
  console.log("\nWaiting for Google authorization…");
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") console.error(`Port ${port} is already in use. Stop the other local process and run the helper again.`);
  else console.error("The local OAuth helper could not start.");
  process.exitCode = 1;
});

const timeout = setTimeout(() => {
  if (!completed) {
    console.error("OAuth authorization timed out. No token was saved.");
    server.close();
    process.exitCode = 1;
  }
}, 10 * 60 * 1000);
timeout.unref();
