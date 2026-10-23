# Google OAuth Setup (Google Cloud Console) and Environment Variables

Status: **Google Sign-In approved as the authentication method (owner, 2026-10-23).** Real credentials do not exist yet. Until they are configured and the flow is tested end to end, **real Google sign-in is not claimed to work**. Facts below are from Google's documentation, checked 2026-10-23. Re-check them when creating the client, because console screens change.

## 1. Before you start: Thapar IT (OI-01)
University Google Workspace admins can block third-party apps from using "Sign in with Google" for their accounts. Ask Thapar IT whether apps outside their organisation may request basic sign-in scopes (`openid`, `email`, `profile`) for @thapar.edu accounts, or whether the app's client ID must be allow-listed. This is an administrative check: it does **not** block development, which uses the local stand-in and test identities.

## 2. Create the OAuth client (owner action; never paste secrets into chat)
1. In Google Cloud Console, create a project (e.g. "Thapar SNS").
2. **Google Auth Platform → Branding:** app name "Thapar SNS", support email, and the "unofficial student project" wording in the app description. Use the TIET logo only if permitted (brand review can apply to logos).
3. **Audience:**
   - **External** user type. "Internal" requires the Cloud project to belong to the institution's own Google Cloud Organization, which a student project normally cannot use.
   - Publishing status: start in **Testing** (up to 100 listed test users). Move to **In production** when ready.
   - Per Google, apps requesting only the basic scopes `openid`, `email`, `profile` are exempt from the unverified-app warning, the user caps and the 7-day authorisation expiry.
4. **Data access (scopes):** `openid`, `email`, `profile` only. Requesting any other scope changes the verification picture; it needs an ADR.
5. **Clients → Create client → Web application:**
   - Authorized JavaScript origins: the app origin(s), e.g. `http://localhost:3000` (development) and the production `https://` origin.
   - **Authorized redirect URIs** (must match exactly: scheme, host, port, path and trailing slash): `<BETTER_AUTH_URL>/api/auth/callback/google`, for example:
     - `http://localhost:3000/api/auth/callback/google` (development)
     - `https://<preview or production host>/api/auth/callback/google`
   - Google requires HTTPS for real deployments. Localhost is commonly accepted for development; confirm in the console when creating the client.
6. Copy the **Client ID** and **Client secret** into the environment of the machine or host that needs them (below). Never commit them, never put them in documentation, chat or screenshots.

## 3. Environment variables (production identity slice)

| Variable | Purpose | Secret? | Example / note |
|---|---|---|---|
| `BETTER_AUTH_URL` | Public base URL of the app; also builds the redirect URI | No | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Signs session cookies and OAuth state (32+ random bytes) | **Yes** | Generate locally: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | OAuth client ID | No (but keep out of Git anyway) | `....apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | **Yes** | From the console |
| `AUTH_ALLOWED_EMAIL_DOMAIN` | Domain accepted by the server-side identity policy and Google `hd` | No | `thapar.edu` per FR-AUTH-1, pending OI-51 |

Where they live:
- **Local:** `.env` (gitignored; `npm run setup:local` never writes Google values).
- **Vercel / Fly.io:** the platform's secret settings (gate G-1c).
- **CI:** none needed; tests use the local stand-in.

## 4. Local development without real credentials
- The auth spike suite (`npm run spike:auth`) runs the complete Google flow against a local stand-in for Google's token and key endpoints, signed with a throwaway key. It needs no credentials or network access to Google.
- The production slice adds a **test-only sign-in provider** for E2E tests, compiled in only when `NODE_ENV=test` and `E2E_AUTH=1`. A build check fails any production build that includes it (test strategy §3).
- With real credentials in `.env`, the same code path talks to Google. The first successful real sign-in is recorded in the phase report; until then, real sign-in is "not yet verified".

## 5. Security notes
- Better Auth checks Google's `hd` claim in the ID token. Our server policy re-checks: exact domain, `email_verified === true`, lower-cased email. Google's docs say the `hd` request parameter alone must not be trusted.
- Users are identified by Google's `sub` (stored as the account ID), not by email.
- Origin/CSRF checks are pinned on (spike finding F-05).
