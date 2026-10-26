# Physical Device Test Checklist

Automated tests use browser **emulation** (real Chromium and WebKit engines with device viewports, pixel density and touch input). Emulation does not reproduce real hardware: notches and home indicators, on-screen keyboards, OEM browser changes (Samsung Internet, Vivo and OnePlus system browsers), font scaling settings, or performance on low-end phones. This checklist covers that gap. **Nothing on this list has been run on a physical device yet** (status table below). Emulated runs (Chromium and WebKit, 14 profiles) are recorded at the end.

## How to open a local build on a phone (owner's choice; read the warning)
Full instructions, including signed-in testing on Android over USB port forwarding, are in `docs/testing/phone-testing.md` (2026-10-26). The Wi-Fi method below covers signed-out pages only.

1. `npm run build`, then `npx next start -H 0.0.0.0 -p 3000`.
2. On the phone (same Wi-Fi), open `http://<computer's LAN IP>:3000`.
3. Stop the server when done.

Warning: `-H 0.0.0.0` makes the app reachable by every device on the network, and the local database now holds real data (your account, official faculty and society data). Only do this on a trusted network.

Sign-in limitation (checked 2026-10-26 against Google's official guide, https://developers.google.com/identity/protocols/oauth2/web-server, "Redirect URI validation rules": redirect URIs must use HTTPS except for localhost, and hosts cannot be raw IP addresses): Google OAuth accepts plain-http redirect addresses only for `localhost`, so signing in does not work when a phone opens the laptop's LAN address. On a phone over the LAN, only the signed-out pages can be checked (the login page and its photograph). The signed-in checks below need the preview deployment (gate G-1c), or a temporary HTTPS tunnel approved by the owner (a new external service).

## Devices and browsers
| Device class | Example devices | Browsers |
|---|---|---|
| Android phone | OnePlus, Vivo, Samsung | Chrome, Samsung Internet, OEM default browser |
| iPhone | Any model with a notch or Dynamic Island, plus a small-screen model if available | Safari (all iOS browsers use WebKit) |
| Android tablet | Samsung Galaxy Tab or similar | Chrome |
| iPad | Any iPad | Safari |
| Windows laptop/desktop | Any | Chrome, Edge (Firefox optional) |
| macOS laptop/desktop | Any | Safari, Chrome |

## Checks per device (Slice 1a shell)
- [ ] Every page in the sidebar opens; the highlighted item matches the page.
- [ ] Phones and portrait tablets: the menu button opens the drawer; tapping a link closes it; every item is reachable by scrolling in **landscape**.
- [ ] Rotating the device does not break the layout; tablets switch between drawer and sidebar at the expected width.
- [ ] No sideways scrolling on any page; text is readable without zooming; pinch zoom works.
- [ ] Notch / Dynamic Island / home indicator never covers content or buttons, in portrait and landscape.
- [ ] Buttons and links are easy to tap without hitting a neighbour.
- [ ] With the system font size increased (Android "Font size", iOS "Larger Text"), pages remain usable.
- [ ] Login page: the TIET logo and the unofficial-project note are visible; the sign-in button is disabled.
- [ ] Desktop: Tab key reaches "Skip to main content" first; focus outlines are visible.

## Checks per device (complete application, after signing in)
- [ ] Login page: the campus photograph fades into the background (from the right on wide screens, downward on phones); the form stays readable; Google sign-in works with an @thapar.edu account.
- [ ] Profile completion and editing: on-screen keyboard types (text, number), the Next/Go keys, no zoom when a field is focused.
- [ ] Societies: the official organisations list scrolls smoothly with logos; an organisation page opens.
- [ ] Faculty: leadership first, then units; a unit list starts with its Head; photos load; search tolerates a typo.
- [ ] Events: register (including a custom question), cancel, and the "Interested" count updates live in a second browser.
- [ ] Find Mates: create a request (rich-text editor works with the on-screen keyboard), respond, accept, and chat: messages arrive live.
- [ ] Study material: upload a PDF and a photo from the camera and from the gallery; it shows "being checked", then appears; download opens it.
- [ ] Archive: submit a project with screenshots; comment and reply.
- [ ] Calendar: month grid on tablets and desktops, agenda on phones; add a personal entry; export opens in the device calendar app.
- [ ] Notifications: the badge updates live; marking read works.
- [ ] Add to home screen (PWA): the app opens standalone with the TIET icon; with the network off, the offline page appears.
- [ ] Loading, empty and error states read well; nothing is cut off at the largest system font size.

## Status
| Date | Device | OS / browser | Tester | Result |
|---|---|---|---|---|
| (none yet: physical) | | | | |

Emulated (not physical), `npm run test:e2e`:
- 2026-10-25: 744 passed, 0 failed across 14 profiles (Galaxy S24 and Pixel 7 incl. landscape, iPhone SE 320 and 375, iPhone 15 incl. landscape, Galaxy Tab S9 and iPad portrait and landscape, Windows Chrome 1366, Edge 1920, Safari 1440).
- 2026-10-26: final regression run, see `docs/status/implementation-status.md`.

Firefox is not installed for Playwright; adding it is a browser download that needs the owner's approval.
