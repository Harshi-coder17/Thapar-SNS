# Google OAuth Setup (Google Cloud Console) and Environment Variables

Status: **Google Sign-In approved as the authentication method (owner, 2026-10-23).** **Real Google sign-in verified locally by the owner on 2026-10-24** (their own @thapar.edu account, `http://localhost:3000`, OAuth client in Testing mode). Not yet verified: rejection of a real non-@thapar.edu account against real Google, and any deployed origin (G-1c). Facts below are from Google's documentation, checked 2026-10-23 and re-checked 2026-10-24. Re-check them when creating the client, because console screens change.

## 1. Before you start: Thapar IT (OI-01)
University Google Workspace admins can block third-party apps from using "Sign in with Google" for their accounts. Ask Thapar IT whether apps outside their organisation may request basic sign-in scopes (`openid`, `email`, `profile`) for @thapar.edu accounts, or whether the app's client ID must be allow-listed. This is an administrative check: it does **not** block development, which uses the local stand-in and test identities.

## 2. Create the OAuth client (owner action; never paste secrets into chat)
1. In Google Cloud Console, create a project (e.g. "Thapar SNS").
2. **Google Auth Platform → Branding:** app name "Thapar SNS", support email, and the "unofficial student project" wording in the app description. Use the TIET logo only if permitted (brand review can apply to logos).
3. **Audience:**
   - **External** user type. "Internal" requires the Cloud project to belong to the institution's own Google Cloud Organization, which a student project normally cannot use.
   - Publishing status: start in **Testing** (up to 100 listed test users). Move to **In production** when ready.
   - Google's documentation (checked 2026-10-23) says apps requesting only the basic scopes `openid`, `email`, `profile` get exceptions from the unverified-app warning, the test-user cap and the 7-day authorisation expiry. **This is not a guarantee** that users will see no warning or face no restriction:
     - Google can still require **brand verification** (for example to show the app name or logo on the consent screen), and its policies and console screens change.
     - **Workspace administrators (Thapar IT) can block or restrict third-party apps** for @thapar.edu accounts regardless of consent-screen settings (§1, OI-01).
     - An External app may need Google's review if scopes, branding or usage change.

     Confirm the actual behaviour with real accounts in **Testing** mode before relying on it.
4. **Data access (scopes):** `openid`, `email`, `profile` only. Requesting any other scope changes the verification picture; it needs an ADR.
5. **Clients → Create client → Web application:**
   - Authorized JavaScript origins: the app origin(s), e.g. `http://localhost:3000` (development) and the production `https://` origin.
   - **Authorized redirect URIs** (must match exactly: scheme, host, port, path and trailing slash): `<BETTER_AUTH_URL>/api/auth/callback/google`, for example:
     - `http://localhost:3000/api/auth/callback/google` (development)
     - `https://<preview or production host>/api/auth/callback/google`
   - Google requires HTTPS for real deployments. Localhost is commonly accepted for development; confirm in the console when creating the client.
6. Copy the **Client ID** and **Client secret** into the environment of the machine or host that needs them (below). Never commit them, never put them in documentation, chat or screenshots.
   - **The client secret is shown only once, when the client is created** (Google console, checked 2026-10-24). Copy it straight into `.env` while the dialog is open. If it is lost, add a new secret on the client (at most two exist at once); there is no need to recreate the client.

## 3. Environment variables (production identity slice)

| Variable | Purpose | Secret? | Example / note |
|---|---|---|---|
| `BETTER_AUTH_URL` | Public base URL of the app; also builds the redirect URI | No | `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Signs session cookies and OAuth state (32+ random bytes) | **Yes** | Generate locally: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | OAuth client ID | No (but keep out of Git anyway) | `....apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | **Yes** | From the console |
| `AUTH_ALLOWED_EMAIL_DOMAIN` | Domain accepted by the server-side identity policy and Google `hd` | No | `thapar.edu` (FR-AUTH-1; confirmed by the owner 2026-10-24, OI-51) |
| `ADMIN_EMAILS` | Comma-separated `@thapar.edu` addresses that become ADMIN when they sign in (OI-09) | No | Optional; e.g. the owner's own TIET address |

Where they live:
- **Local:** `.env` (gitignored; `npm run setup:local` never writes Google values).
- **Vercel / Fly.io:** the platform's secret settings (gate G-1c).
- **CI:** none needed; tests use the local stand-in.

## 4. Local development without real credentials
- The auth spike suite (`npm run spike:auth`) runs the complete Google flow against a local stand-in for Google's token and key endpoints, signed with a throwaway key. It needs no credentials or network access to Google.
- E2E tests use a **test-only sign-in** that exists only in E2E builds (`npm run test:e2e`) and works only with `E2E_TEST_AUTH=1` on localhost/127.0.0.1, never on a deployment (OI-53). The Google values in `playwright.config.ts` are placeholders, not credentials; no request reaches Google.
- Without Google credentials, `npm run dev` works and `/login` shows the button disabled with "Google sign-in is not configured on this server yet".
- With real credentials in `.env`, the same code path talks to Google. The first successful real sign-in was recorded on 2026-10-24 (`docs/status/phase-reports/slice-1b.md`).

## 5. Security notes
- Better Auth checks Google's `hd` claim in the ID token. Our server policy re-checks: exact domain, `email_verified === true`, lower-cased email. Google's docs say the `hd` request parameter alone must not be trusted.
- Users are identified by Google's `sub` (stored as the account ID), not by email.
- Origin/CSRF checks are pinned on (spike finding F-05).

## 6. Development requirements vs production-readiness requirements
| Item | Development and testing | Production readiness (before real users) |
|---|---|---|
| Google OAuth client and secrets | Not needed; the local stand-in and the test-only sign-in cover the flow | **Required**, created by the owner, stored only in the host's secret settings |
| Thapar IT confirmation (OI-01) | Not needed | **Required**: confirm @thapar.edu accounts may sign in to this external app (or allow-list its client ID) |
| End-to-end test with a real @thapar.edu account | Not possible without credentials | **Required** before claiming real Google sign-in works |
| Consent screen in Testing vs In production | Testing is enough for the team | Move to In production after the real-account test; check whether brand verification is requested |
| HTTPS origin and exact redirect URI | `http://localhost:3000` | **Required** HTTPS host registered exactly |

