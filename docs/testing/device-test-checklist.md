# Physical Device Test Checklist

Automated tests use browser **emulation** (real Chromium and WebKit engines with device viewports, pixel density and touch input). Emulation does not reproduce real hardware: notches and home indicators, on-screen keyboards, OEM browser changes (Samsung Internet, Vivo and OnePlus system browsers), font scaling settings, or performance on low-end phones. This checklist covers that gap. **Nothing on this list has been run yet** (status table below).

## How to open a local build on a phone (owner's choice; read the warning)
1. `npm run build`, then `npx next start -H 0.0.0.0 -p 3000`.
2. On the phone (same Wi-Fi), open `http://<computer's LAN IP>:3000`.
3. Stop the server when done.

Warning: `-H 0.0.0.0` makes the app reachable by every device on the network. Only do this on a trusted network. The Slice 1a shell has no data or login, but later slices will. Preview deployments (gate G-1c) are the safer route once they exist.

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

Later slices add checks for: sign-in, forms and the mobile keyboard (field types, autofill, Next/Go keys, no zoom-on-focus), file uploads (camera and gallery pickers), chat, and loading/empty/error states.

## Status
| Date | Device | OS / browser | Tester | Result |
|---|---|---|---|---|
| (none yet) | | | | |
