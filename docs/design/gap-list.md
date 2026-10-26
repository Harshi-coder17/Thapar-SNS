# Design Gap List: montage elements without a requirement

Every item is `[OPEN]` and **will not be built** unless approved. "Related" shows whether the item touches an existing requirement; a related requirement is still implemented as specified regardless of the gap decision.

| ID | Panel | Element seen in montage | Related requirement | Recommended default `[PROPOSED]` |
|---|---|---|---|---|
| G-01 | 1 | "By continuing, you agree to our Terms and Privacy Policy" links | Privacy (OI-27) | **Build** minimal Terms + Privacy pages (supports DPDP compliance; OI-27) |
| G-02 | 2 | Global search ("people, societies, events, resources") | Module searches exist separately | Omit; module-level search only |
| G-03 | 2 | "Trending This Week" carousel | – | Omit |
| G-04 | 2 | "Recent Activity" feed with **Follow** button | – | Omit Follow. Home shows upcoming events + quick links (no new features) |
| G-05 | 2 | Personalised greeting, quick module tiles with counts | Navigation | Build (presentation only, uses existing data) |
| G-06 | 3 | **Join Society** button | FR-SOC-2 (how Members join is OI-10) | **Built (Slice 2a, OI-10 approved 2026-10-24):** "Request to join" (Head approves) plus a separate "Follow" button |
| G-07 | 3 | **Message** society button | – (chat is MateConnection-only per spec) | Omit |
| G-08 | 3 | Tabs Members / Resources; member/event counts; "Est. year" | FR-SOC-1 fields | **Slice 2a:** member and follower counts and a public core team (Head, Editors, Event Managers); full Members tab for members only; Resources and "Est." omitted |
| G-09 | 4 | Event category chips (Technical, Cultural, Sports, Workshop, Seminar); "My Events / My Registrations" tabs | EVT fields have no category | Category: OI-12. "My Registrations": build (derived from FR-EVT-3 data) |
| G-10 | 5 | **DOCX** file in list | FR-MAT-1 allows PDF/JPEG/PNG only | Omit (requirement wins) |
| G-11 | 5 | Comment counts on materials | No comments FR for materials | Omit |
| G-12 | 6 | **People** tab (browse students) | – | Omit (privacy; OI-27) |
| G-13 | 6 | "I'm Interested" button and "n interested" count instead of a response message | FR-MATE-3 requires a response **with a message** | Button opens the respond-with-message form (label may stay "I'm Interested"); count = number of responses: **needs approval** |
| G-14 | 6 | "Filters" panel | FR-MATE-2 filters | Build (type, skills, subject per OI-15) |
| G-15 | 8 | **Placement** calendar layer (5th legend item) | FR-CAL-1 has 4 layers | Omit |
| G-16 | 9 | Upvote counts on projects | Archive voting (OI-22) | Depends on OI-22 |
| G-17 | 9 | Category chips (Web, Mobile App, AI/ML, Hardware, Research, Final Year) | FR-ARC-1 technology tags | Implement as tag filters from techTags; no separate category field |
| G-18 | 10 | Profile stats: Connections, Projects, Societies, Events | – | Show only counts derivable from existing data (societies, events registered, projects); omit "Connections" as a social graph |
| G-19 | 10 | Tabs Activity / Achievements / Connections; bio, location, social link | UCD-2 View Profile | Omit Activity/Achievements/Connections; bio optional field: needs approval (OI-35) |
| G-20 | 11 | **Voice / video call** icons | LIM-3 excludes video/voice | Omit (spec excludes) |
| G-21 | 11 | **Group chats** ("CSE Study Group", "AI/ML Project", "Placement Prep") | FR-MATE-4: chat between the two students | Omit; see OI-16 |
| G-22 | 11 | "Shared a file" / attachments, emoji picker | – | Omit attachments (new upload surface); emoji via OS keyboard only |
| G-23 | 11 | "Active now" presence, unread badges | – | Unread badges: build (notifications). Presence: omit |
| G-24 | 11 | Messages entry point (not in sidebar) | FR-MATE-4 | Access chat from Find Mates → My Connections; adding a sidebar item needs approval |
| G-25 | 1 | Campus photograph in the login page's right-hand panel | Design (no FR) | **Owner will provide a photo** they have the right to use (2026-10-24). The montage crop is too small (about 380 × 360 px) and appears AI-generated with the institute's name on the building, so it is not reused. Until then the panel shows the brand colour. Added in whichever slice is current when the photo arrives |
