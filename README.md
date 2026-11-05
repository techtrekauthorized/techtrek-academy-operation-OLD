# TechTrek Academy Operations System

Internal Next.js operations application for TechTrek Academy.

## MVP data architecture

Google Sheets is the source of truth for the connected MVP workflows: students, enrollments, program offerings, payments, receipts, and system configuration. Google Docs supplies the receipt template and Google Drive stores the generated receipt PDFs. Other operational modules remain frontend mockups until their backend phases.

The server expects exactly these spreadsheet tabs: `Universities`, `Tracks`, `Students`, `Enrollments`, `Payments_Receipts`, `System_Config`, and `Users`. Do not rename their existing headers.

## Environment

Copy `.env.example` to a local, uncommitted `.env.local` and configure:

```text
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=
GOOGLE_SHEET_ID=
AUTH_SECRET=
```

`AUTH_SECRET` signs the eight-hour internal session cookie and must be a strong value of at least 32 characters. Keep it server-only.

## Internal users and roles

The `Users` Google Sheet tab uses these exact headers:

```text
User_ID, Username, Display_Name, Role, Password, Is_Active
```

Allowed roles are `SALES`, `COORDINATOR`, and `ADMIN`. Password values are intentionally plaintext for this limited private MVP and are compared only in server-side code. Passwords are never returned to browser code or included in session payloads. Password hashing must be introduced before the user count expands or the system receives any public access.

The service-account JSON must be Base64-encoded and is used only for Google Sheets. Share the spreadsheet with the service-account email.

Google Docs and Google Drive use an OAuth user account because the receipt template and folders live in a personal My Drive:

```text
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=
GOOGLE_OAUTH_REDIRECT_URI=
```

Configure the redirect URI as `/api/google/oauth/callback` on the deployed application origin. The OAuth consent flow uses Drive and Documents scopes with offline access and forced consent. The refresh token must be provisioned through secure environment configuration; it is never returned to the browser, written to the spreadsheet, stored in a cookie, or printed in application logs.

### Generate the OAuth refresh token locally

Add this exact authorized redirect URI to the Google OAuth client:

```text
http://localhost:3001/oauth2callback
```

Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in your uncommitted local `.env.local`, then run:

```bash
npm run google:oauth-token
```

The helper binds only to `127.0.0.1` on port `3001`, prints a Google authorization URL, validates the callback state, exchanges the authorization code, and prints the refresh token once in the local terminal. Sign in with `techtrekadmin@gmail.com`.

Copy the printed value manually into:

```text
GOOGLE_OAUTH_REFRESH_TOKEN
```

Add it to both local `.env.local` and Vercel Environment Variables. Never commit it, paste it into browser code, or store it in Google Sheets. Restart the development server after updating `.env.local`.

Credentials are consumed only by server-only modules and are never exposed through client bundles or API responses.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000/dashboard`. Test Workspace access from Settings → Google Integration Status or `GET /api/health/google`.

Validation commands:

```bash
npm run lint
npm run typecheck
npm run build
```

## Concurrency warning

Sequential student, enrollment, payment, and receipt IDs are generated from the highest existing sequence. The receipt counter is stored in `System_Config`. The current MVP assumes a low-concurrency internal team and disables repeated form submission in the browser, but Google Sheets does not provide a database-grade transaction lock. A locking/idempotency strategy is required before multiple finance users can submit payments concurrently at scale.

Payments are immutable in this phase. Corrections require a future reversal/refund workflow rather than editing historical payment rows.
