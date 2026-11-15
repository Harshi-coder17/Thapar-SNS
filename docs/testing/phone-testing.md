# Testing the local site on a phone

Written 2026-10-26 from the current configuration. Nothing here exposes the site to the internet or changes authentication or OAuth settings.

## 1. Why the address matters

The app is configured for `http://localhost:3000` (`BETTER_AUTH_URL`), and several things depend on that exact address:

| What | Why it matters on a phone |
|---|---|
| **Google sign-in** | Google redirects back only to the registered redirect URI, `http://localhost:3000/api/auth/callback/google`. Google accepts plain `http` only for `localhost`, and raw IP addresses are not allowed as hosts (Google OAuth 2.0 for web server apps, "Redirect URI validation rules", official, checked 2026-10-26). A Wi-Fi address such as `http://192.168.1.20:3000` cannot be registered. |
| **Change requests** (posting, registering, uploading) | Refused with 403 unless the browser's Origin is exactly `http://localhost:3000` (CSRF protection, OI-52). |
| **Uploads and images** | Signed storage links point to `http://127.0.0.1:3900` (local Garage). |
| **Live updates** | Realtime connects to `ws://127.0.0.1:4100/ws`. |
| **PWA** (service worker, install, offline page) | Needs a secure context: HTTPS, or `localhost`. A Wi-Fi `http://` address is not secure, so the service worker does not register. |

So the phone must reach the site **as `localhost`**. The best way, on Android, is USB port forwarding (§2). Over plain Wi-Fi (§3) only the signed-out pages can be checked.

## 2. Android: full testing over USB (recommended)

Port forwarding makes the phone's `localhost:3000` reach the Mac's `localhost:3000` over the cable. Source: Chrome DevTools documentation, "Access local servers and Chrome instances with port forwarding" (developer.chrome.com/docs/devtools/remote-debugging/local-server, official, checked 2026-10-26). Network and firewall settings do not matter, because traffic goes over USB.

### On the Mac

1. Start the local services: `npm run db:up`.
2. Start the app and the background service: `npm run dev:all`.
3. Check the app loads at `http://localhost:3000`.

### On the phone, once

1. Enable Developer options: Settings > About phone > tap **Build number** seven times.
2. Turn on **USB debugging** in Developer options.
3. Connect the phone to the Mac by USB and accept the "Allow USB debugging" prompt.

### In desktop Chrome on the Mac

1. Open `chrome://inspect/#devices` and tick **Discover USB devices**. The phone should appear.
2. Click **Port forwarding**, tick **Enable port forwarding**, and add these three rules:

   | Device port | Local address |
   |---|---|
   | `3000` | `localhost:3000` (the app) |
   | `3900` | `localhost:3900` (local storage: uploads, logos, photos) |
   | `4100` | `localhost:4100` (live updates) |

3. Click **Done**, and keep `chrome://inspect` open while testing.

### On the phone

Open Chrome and go to **`http://localhost:3000`**. Then:

- **Sign in with your @thapar.edu Google account.** This works, because the redirect returns to `localhost:3000`.
- **All features work:** posting, uploads, images, live updates and notifications.
- **PWA:** the service worker registers, and "Add to Home screen" or "Install app" is offered. The offline page can be tested by stopping `npm run dev:all`.
- **Session policy:** an Android phone's browser is classified as a phone, so the phone limits apply (7 days of inactivity, 30 days absolute; `docs/auth/session-policy.md`).

**Limitations**

- **Production build:** `npm run dev` is a development build, slower and with development tooling. For a production-like check, run `npm run build`, then `npx next start -p 3000`, with the same forwarding.
- **Upload size:** the phone uploads files from its own storage. Limits are as specified (OI-39).

## 3. Any phone over Wi-Fi: signed-out pages only

This is useful only for the login page's layout, the offline page and general rendering on iPhone.

1. Phone and Mac must be on the same Wi-Fi.
2. Find the Mac's address with `ipconfig getifaddr en0` (Wi-Fi; try `en1` if it is empty), e.g. `192.168.1.20`.
3. `next dev` listens on all interfaces by default (Next.js CLI docs: `--hostname` default `0.0.0.0`). On the phone, open `http://192.168.1.20:3000/login`.
   Note: because of that default, a running `npm run dev` is reachable from other devices on the same network even when you are not testing a phone. Only its signed-out pages are usable without a session, but use trusted networks; `npx next dev -H 127.0.0.1` keeps it on the Mac only.
4. If macOS asks whether `node` may accept incoming connections, allow it. If the page does not load, check System Settings > Network > Firewall.
5. **Development scripts are blocked.** Next.js blocks its development scripts for any hostname other than `localhost` unless the address is listed in `allowedDevOrigins` in `next.config.ts` (Next.js 16 docs, `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md`). Without that entry, the page renders from the server but buttons that need JavaScript do not respond. Adding the Wi-Fi address there is a local configuration change. It is not made by default.
6. **Sign-in will not work** at this address, and must not be "fixed" by:
   - registering the Wi-Fi address with Google;
   - turning on the test sign-in;
   - loosening the Origin check.

## 4. iPhone (Safari)

iOS has no equivalent of Chrome's USB port forwarding, so signed-in testing on an iPhone is not possible against the local site without exposing it.

| Option | What it needs |
|---|---|
| Signed-out pages over Wi-Fi | §3, now |
| Emulated iPhone | Already covered: the E2E suite runs WebKit iPhone profiles (`playwright.config.ts`) |
| Full signed-in testing | An HTTPS preview deployment (Slice 1c), with its redirect URI registered in Google. Both need the owner's explicit authorisation. |

A public tunnel (ngrok, Cloudflare Tunnel and similar) would put the local site and development database on the internet. It is not used without authorisation.

## 5. Which features need HTTPS or a preview deployment

| Feature | Android over USB (§2) | Wi-Fi address (§3) | Preview deployment (HTTPS) |
|---|---|---|---|
| Login page layout | yes | yes | yes |
| Google sign-in and every signed-in page | yes | no | yes |
| Posting, registering, uploads (Origin check) | yes | no | yes |
| Images and uploads (storage) | yes | no | yes |
| Live updates | yes | no | yes |
| PWA install, service worker, offline page | yes | no | yes |
| iPhone signed-in testing | no | no | yes |

The physical-device checklist is in `docs/testing/device-test-checklist.md`.
