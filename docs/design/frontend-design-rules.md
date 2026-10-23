# Frontend Design Rules

## 1. Sources and their authority

| Source | Authority |
|---|---|
| Spec FRs, use cases, NFR-USE | **What** to build `[SPEC]` |
| `project-docs/design-reference/thapar-sns-master-visual-reference.png` (12-panel montage) | **How it should look**: style, layout, component patterns. **Not** a source of features |
| `project-docs/TIET-Logo.png` | Brand mark `[APPROVED 2026-10-23]`: use the owner-provided file unchanged (served as `public/brand/tiet-logo.png`, same SHA-256) with a discreet "Unofficial student project" note |
| `docs/design/gap-list.md` | Montage elements with no requirement. Not built unless approved |

`project-docs/` is read-only. If higher-resolution per-screen images are added later, place them in `project-docs/design-reference/` named `NN-<screen>.png` (e.g. `03-society.png`) and add them to `screen-map.md`.

## 2. Visual direction (observed in the montage); tokens measured in Slice 1a

- **Palette:** a deep maroon/crimson primary for primary actions (e.g. "Register", "Create Request", "Upload Material"). Light rose tint for the active navigation item and soft badges. White cards on a very light grey page background. Neutral grey secondary text. Pastel chips for tags. Calendar layer colours distinct per layer. Exact values are sampled from the reference and recorded in §2.1; nothing is guessed in code.
- **Layout:** fixed left sidebar (logo, nav: Home, Societies, Events, Find Mates, Study Material, Archive, Faculty, Calendar, Placement; Notifications and a user card at the bottom). Top area with page title + subtitle, a search field, and a primary action button on the right. Content in white rounded cards.
- **Components:** rounded cards with subtle borders, pill filter chips, tabs with an underline indicator, avatar + name + meta rows, icon + metadata lines, tag chips, primary/secondary buttons, month grid calendar, two-pane chat.
- **Typography:** **Inter** via `next/font/google` `[APPROVED 2026-10-23]` (downloaded at build time and self-hosted), with a system sans-serif fallback. Bold page titles, medium card titles, small grey metadata.
- **Mobile (panel 12):** the sidebar becomes a slide-over drawer with search at the top. Every screen must work at 400 px width (NFR-USE).

### 2.1 Measured tokens (Slice 1a, `npm run design:sample-colors`)

| Token | Value | Measured from | Notes |
|---|---|---|---|
| `brand` | `#8c0828` | Panel 5 "Upload Material", panel 6 "Create Request", panel 5 active "All" chip (all three agree) | White text on it: about 9.6:1 |
| `brand-hover` | `#73061f` | Derived (darker brand) | |
| `accent` | `#f8ecf0` | Panel 5 active nav background | |
| `accent-foreground` | `#73061f` | Derived; active nav text in the montage is a dark maroon | |
| `canvas` (page background) | `#f8f8f8` | Panel 5 sidebar/page area | |
| `surface` (cards) | `#ffffff` | Panel 5 cards measure `#fcfcfc` (JPEG-like softening); white used | |
| `ink` (text) | `#0b0a21` | Darkest pixel of panel 5 subtitle text | |
| `muted` (secondary text) | `#5c5e75` | Panel 5 metadata text, darkened slightly for contrast | On white: about 6:1 |
| `line` (borders) | `#e6e6ee` | Card borders (thin lines are blurred at montage resolution; approximate) | |

Calendar layer colours could not be measured reliably at montage resolution (dots are a few pixels wide). They are set in Slice 4d, ideally from full-resolution screens.

### 2.2 Logo usage
- Sidebar and mobile header: the "ti" mark only, cropped **by CSS** from the unchanged file. Mark bounds measured in the 200x200 source: x 56 to 140, y 12 to 125.
- Login page: the full logo, including the institute name.
- The note "Unofficial student project" appears under the wordmark in the sidebar and mobile header. The login page states "Not affiliated with or endorsed by Thapar Institute of Engineering and Technology".

## 3. Rules

1. **Montage = style only.** Implement only elements backed by a requirement or an approved gap-list item. Unapproved montage elements are omitted, not shown disabled, unless the owner approves "visible but disabled".
2. **Correct the montage where it is internally inconsistent.** Example: panels 6, 7 and 9 highlight "Study Material" as the active nav item on other pages. The active item must match the current page.
3. **Use shadcn/ui primitives themed with our tokens.** No one-off component styles inside modules. Shared components live in `src/shared/ui`.
4. **Accessibility:** WCAG 2.2 AA target.
   - Text contrast ≥ 4.5:1 (check white-on-maroon and grey metadata text).
   - Visible focus states, labelled form fields, keyboard-operable menus, dialogs and calendar.
   - Never rely on colour alone (calendar layers also need labels/patterns).
5. **Truthful states:** loading, empty, error and "processing" states are designed for every list and every asynchronous action. Examples: "Processing…" for uploads; "Waitlisted (position n)" for registrations.
6. **Unofficial labelling:** faculty and placement screens show the LIM-2 / PLC-4 "unofficial" notices.
7. **Three-click rule (NFR-USE):** core tasks (create mate request, upload material, register for event) are reachable within 3 clicks from Home. Verified by Playwright click-count tests.
8. **Images:** user-uploaded images render only from approved assets via signed URLs. Placeholders otherwise.
9. **No real personal data in seeds or screenshots** beyond consenting team members. The montage's sample names are placeholders.
10. **Touch targets:** every link and button is at least 44x44 CSS px (Button `md` and `icon` sizes, nav rows `min-h-11`). Text links outside a sentence use `inline-flex min-h-11 items-center`. Enforced by `tests/e2e/responsive.spec.ts`.
11. **Short screens:** scrollable panels (sidebar, drawer, dialogs) use `min-h-0 overflow-y-auto` so every item stays reachable on landscape phones.
12. **Viewport and safe areas:** pinch zoom is never disabled. `viewport-fit` stays at the browser default, so iOS and Android keep content out of notch and home-indicator areas. Edge-to-edge (`cover` plus `env(safe-area-inset-*)` padding) is introduced only with the PWA work and verified on physical devices (OI-49).
13. **Forms and mobile keyboards (from Slice 1b):** correct `type` (`email`, `search`, `url`, `tel`), `inputmode`, `autocomplete` and `enterkeyhint` on every field; input text at least 16 px (prevents iOS zoom-on-focus); labels always visible; errors announced with `aria-describedby`; use `dvh` units so the on-screen keyboard does not hide actions.
14. **Motion:** decorative motion uses `motion-safe:` so reduced-motion preferences are respected.

## 4. Review process per UI slice
Playwright screenshots at 1280 px and 400 px are placed side by side with the matching montage panel in the phase report. Any intentional differences (accessibility fixes, unapproved elements omitted) are listed.
