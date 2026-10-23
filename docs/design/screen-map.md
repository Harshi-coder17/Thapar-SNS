# Reference Screen Map

Maps each montage panel to requirements, the implementing slice and the proposed route. Elements without a requirement are listed in [gap-list.md](gap-list.md) with ID `G-nn`.

| # | Panel | Requirements it serves | Slice | Proposed route | Gap items |
|---|---|---|---|---|---|
| 1 | Login / Landing | FR-AUTH-1, UCD-1 | 1b | `/login` | G-01 |
| 2 | Home Feed / Dashboard | Navigation hub; quick links to modules | 1a (shell), 6 (content) | `/` | G-02, G-03, G-04, G-05 |
| 3 | Society Page | FR-SOC-1…4, SPEC-SOC-PERM (social links), FR-EVT (upcoming events) | 2a | `/societies/[slug]` | G-06, G-07, G-08 |
| 4 | Events Page | FR-EVT-1…4, UC-07 | 2b | `/events` | G-09 |
| 5 | Study Material | FR-MAT-1…4, UC-13 | 2d | `/materials` | G-10, G-11 |
| 6 | Find Mates | FR-MATE-1…5, UC-10 | 2c | `/mates` | G-12, G-13, G-14 |
| 7 | Faculty Directory | FR-FAC-1…3 | 4b | `/faculty` | – |
| 8 | Calendar | FR-CAL-1…3 | 4d | `/calendar` | G-15 |
| 9 | Project Archive | FR-ARC-1…3 | 4c | `/archive` | G-16, G-17 |
| 10 | User Profile | FR-AUTH-2, UCD-2 View Profile | 1b (basic), later | `/profile/[id]` | G-18, G-19 |
| 11 | Chat / Messaging | FR-MATE-4 chat channel | 4a | `/mates/connections/[id]` | G-20, G-21, G-22, G-23, G-24 |
| 12 | Mobile View (Sidebar) | NFR-USE responsive | 1a | (all) | – |
| – | *(no panel)* Placement Matrix | PLC-1…5 | 4e | `/placement` | Sidebar shows "Placement" (matches approved scope) |
| – | *(no panel)* Admin screens | FR-AUTH-4, FR-SOC-1, FR-ARC-2, FR-FAC-3, PLC-1, SPEC-ADMIN | per slice + 5 | `/admin/...` | Styled from the same component set |
| – | *(no panel)* Notifications | SPEC-W2, UC-13 E2, ACT-4/6/7 | 3a | `/notifications` | Sidebar shows "Notifications" |
