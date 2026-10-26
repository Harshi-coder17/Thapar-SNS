# Society Import: Research Dataset and Dry-Run Report (2026-10-25)

**Nothing has been written to any database, and nothing has been imported.** This report describes what an import *would* do. The read-only dry run is `npm run societies:import:dry-run` (`scripts/society-import/dry-run.mjs`, which has no apply mode and opens the database READ ONLY). An import requires the owner's explicit approval and a separately reviewed tool.

**Owner decision on official data (2026-10-25, latest; ADR-0013 §12):** information published on the official Thapar website, including the institute's student-activities portal studentsocieties.thapar.edu and the official department or school faculty pages, is treated as **verified** for this project. Records now carry `review.sourceStatus = official_published`. `review.appReview = pending` only means that an imported society stays hidden and inactive until it has a Head and an admin activates it in the application. Official data grants **nobody** any application permission: no Head or admin access comes from faculty information, society contact details or faculty associations. The import remains on hold.

**Earlier owner decisions applied (2026-10-25, ADR-0013 §10):**
- Electoral Club and Thapar Electoral Club stay **separate** records, flagged as possible duplicates of each other (`review.possibleDuplicateOf`).
- Fields where the official source contradicts itself or is malformed are **kept raw and flagged for review** (`review.questionableFields`).
- Text that is not a URL never becomes a link: `websites` holds only valid URLs, and the raw text stays in `websiteAsPublished`.
- Faculty associations are admin-visible only until reviewed.

## 1. Source and method
- **Source:** https://studentsocieties.thapar.edu/ ("Thapar Institute Student Activities: Student Societies, Clubs & Chapters"). The directory page is rendered in the browser from public JSON endpoints, used here directly:
  - `/api/organizations`: the list, 56 organisations;
  - `/api/org-types`: the site's own type and subtype labels, kept as reference only;
  - `/api/organizations/{id}`: the detail record for each organisation.
- **Detail pages:** the site has no separate HTML detail pages. Its detail panel is filled from `/api/organizations/{id}`. All 56 detail records were fetched (one request at a time, with a pause between requests). They contain the same fields as the list; the only difference is an internal id the site regenerates on each request.
- The site's visitor-count endpoint (`/api/settings/visit`) was deliberately **not** called, because calling it would change the site's counter.
- **Fetched:** 2026-10-24/25. The source's own `updatedAt` values range from 2026-04-29 to 2026-09-25.
- **Files:**
  - `data/society-import/thapar-student-organisations.2026-10-25.json`: every field, faculty associations, source URL, source id and flags;
  - `data/society-import/thapar-student-organisations.2026-10-25.csv`: one row per organisation, for review in a spreadsheet.
- **Safety review (2026-10-25)** before version control:
  - **Secrets:** none. No passwords, tokens, keys, connection strings or credentials (scanned; also asserted by `tests/unit/societies/import-plan.test.ts`).
  - **Student data:** none. The 102 people listed are faculty and staff (93 "Dr.", others "Mr."/"Ms." or untitled, e.g. a librarian, a counsellor, an alumni-relations head, an industrial coordinator), exactly as published by the institute.
  - **Redistribution:** the source shows no copyright notice, terms of use or licence, and has no robots.txt (HTTP 404). This is an official institute portal; we store factual names, objectives and public contact points, with a source link per record. Logos and photos are not copied (links only).
  - **Redactions applied (owner-approved 2026-10-25):**
    1. All 99 faculty **photo links** were removed (`faculty[].imageRef` no longer exists). The application never uses them.
    2. The 2 faculty contact emails that were **personal Gmail addresses** (Dr. Jainy Sachdeva, LEAD SOCIETY; Mr. Tanuj Chopra, Thapar Society of Civil Engineers (TSCE)) were removed (`email: null`).

    Each entry records what was removed in `faculty[].redactions` (`photo_link_removed`, `personal_email_removed`). Institutional @thapar.edu addresses, names, source labels and source URLs are kept. The only remaining Gmail address is Thapar Electoral Club's **organisation** contact address, kept raw and flagged unverified. Asserted by `tests/unit/societies/import-plan.test.ts`.
  - With the redactions applied and the checks re-run (2026-10-25), the dataset files are **ready for the owner's review for version control**.

## 2. Totals
| Measure | Count |
|---|---|
| Organisations in the source | **56** (all included, whatever the source calls them: society, club, chapter, cell, unit) |
| Unique stable keys | 56 (slug of the official name, e.g. `acm-computing-chapter`; the source id is kept as well) |
| Would be created | **56**, hidden and inactive, awaiting their first Head and an admin's activation; data as officially published; the Electoral pair stays two records (§3) |
| Already in the local database | **0** (dry run on 2026-10-25: 40 local societies, all fictitious test records such as "E2E Society…"; no source-key or name match) |
| With description | 56 |
| With contact email | 54 |
| With at least one valid website link | 40 |
| With a logo reference | 54 (reuse rights unknown; references only) |
| With faculty listed | 56 (102 faculty associations in total) |
| With an acronym in the name (e.g. "(CCS)") | 26 |

## 3. Possible duplicates and ambiguous entries (never merged automatically)
| Pair | Evidence | Assessment |
|---|---|---|
| **Electoral Club** and **Thapar Electoral Club** | Same name apart from "Thapar"; objectives 64 % word overlap (the second lists six numbered objectives that include the first's three); same faculty Vice President (Dr. Shilpi Tyagi), same faculty President (Dr. Rakesh Kumar Sharma, listed as Assistant Professor in one and Associate Professor in the other). The first has no email or website and was added 2026-03-13; the second has a Gmail address and its own website and was added 2026-03-19 | Possibly the same organisation. **Owner decision (2026-10-25): keep both as separate records**, each flagged `possibleDuplicateOf` the other |
| Institution of Engineers(India) - Student Chapter (IEI) and Thapar Society of Civil Engineers (TSCE) | Name words overlap ("engineers"), different faculty, different objectives | Distinct organisations. No action |
| AICHE Student Chapter and Indian Institute Of Chemical Engineers (IICHE) | Similar-sounding chemical-engineering bodies | Distinct organisations (American and Indian institutes). No action |
| Several other pairs that share one faculty member | Faculty often coordinate more than one organisation | Normal; not treated as a duplicate signal |

## 4. Data-quality issues found in the source (to verify before publishing)
| Organisation | Issue | Proposed handling |
|---|---|---|
| Energy Conservation Club (ECC) | Email `ebsb@thapar.edu` and website are identical to **Ek Bharat Shreshtha Bharat Club**'s; probably copied by mistake on the source | Kept raw, marked **unverified** on both records (`questionableFields`: contactEmail, websites) |
| Chemist’s Association for Research and Education Society (CARE) | Website is CCS's (`https://www.ccstiet.com`) | Kept raw, marked **unverified** on both records (`questionableFields`: websites) |
| ENACTUS | Website field is the text "ENACTUS Website", not a link | `websites` empty (never linked); raw text kept in `websiteAsPublished`, marked unverified |
| Society of Automotive Engineers Collegiate Club of TIET | Two websites in one field (teamfateh.com, ultronmotorsports.com) | Keep both as separate links |
| Thapar Electoral Club | Contact email is a Gmail address, not @thapar.edu | Kept raw, marked unverified (see §3) |
| Society for Community Engineering (SCE) | No email, website or image | Fields empty |
| Electoral Club | No email or website | Fields empty |
| Team Oorja | Logo embedded in the source as image data, not a link | Not kept |
| CREATIVE COMPUTING SOCIETY (CCS), National Cadet Corps, Society of Intelligent Systems (SIS), Thapar Electoral Club | Logo links point to third-party hosts (Google image cache, Wikimedia, LinkedIn, the club's own site) | References only; never hot-linked |
| Frosh | Trailing space in the published name | Trimmed (flagged) |
| International Association of Students in Economics and Commercial Sciences (AIESEC) - Patiala Chapter (101 characters); Society for Promotion of Indian Classical Music & Culture Amongst Youth (SPIC MACAY) (84) | Longer than the old 80-character limit | The limit is now 150 (migration `20261025010000`); both fit |
| 15 organisations | No website | Empty; nothing invented |

Names are kept exactly as published, including capitalisation ("CREATIVE COMPUTING SOCIETY (CCS)", "ROTARACT CLUB - TIET", "LEAD SOCIETY") and typographic apostrophes ("Chemist’s", "Dance Club ‘NOX’").

## 5. What the source's categories are, and why they are not used
The source groups organisations by its own *type* (society, club, chapter, cell, units) and *subtype* (social, technical / academic, cultural / visual arts, entrepreneurship, debate / literary, physical fitness). These are stored in each record under `source.sourceType` and `source.sourceSubtype` for reference only. Thapar SNS will not use them as categories, and imported societies get **no category** unless the owner assigns one (ADR-0013 §3.5).

## 6. Faculty verification against the official faculty directory (2026-10-25)
**Source rule (owner decisions 2026-10-25).** https://www.thapar.edu/faculties is the **only** authoritative source for faculty names, designations, departments, institutional emails and other details, and every page it redirects to is part of it (each department publishes its faculty on its own site). The student-organisations site, search snippets, third-party sites and guesses are not used to verify anyone.

**Pages used** (fetched one at a time, with a pause; `robots.txt` allows them):
- the directory page, which lists 28 category pages on `www.thapar.edu`:
  - **20** are served directly: 53 people are listed on 11 of them; Mathematics, Humanities & Social Sciences, Chemistry & Biochemistry, Energy & Environment, Alumni Relations and 4 other centres say "No records found";
  - **8** redirect to department or school sites, all used: `tslas`, `ched`, `ced`, `eied`, `eced`, `med`, `btd`, `csed` `.thapar.edu/faculty`, 546 people;
- for TSLAS, whose list shows names but no emails, the official profile pages of the 5 name matches;
- the directory also links (not redirects) to the L. M. Thapar School of Management faculty site on `lmtsm.thapar.edu`. No faculty member in the dataset is listed under LMTSM, so it was not needed.

**Method (revised with the owner's decision on official data).** Officially published faculty details are **verified**. A dataset faculty entry is linked to an official record:
- by exact institutional email (`matchBasis = institutional_email`), or
- by the same name in the same department (`matchBasis = name_and_department`).

The official name, designation, the unit listed under, the email, the profile URL, the listing URL and the directory entry are stored in `faculty[].verification.official`, next to the published values; differences are listed in `discrepancies` and nothing is replaced. A same-name entry in a *different* department is `needs_review`, because the link to the person is uncertain, not the data. People with no official record are `no_official_record`.

**Coverage:**

| | Distinct people | Associations |
|---|---|---|
| Verified, matched by institutional email | **57 of 83** | 70 of 102 |
| Verified, matched by name and department | 2 | 2 |
| Needs review (same name, different department) | 1 | 1 |
| No official record: the official directory lists no people for that department or unit | 14 | 19 |
| No official record: not found in the official faculty lists | 9 | 10 |

- **Matched by name and department (verified):**
  - Dr. Jainy Sachdeva (official: Professor, Electrical & Instrumentation Engineering, jainysachdeva@thapar.edu);
  - Mr. Tanuj Chopra (official: "Dr. Tanuj Chopra", Assistant Professor, Civil Engineering, tchopra@thapar.edu).

  Their published personal Gmail addresses stay removed; the official institutional addresses are kept in `verification.official` only.
- **Needs review:** Dr. Mamta Gulati. Published as Assistant Professor, SOM (Mathematics); the only official entry with that name is in TSLAS and shows no email. It may or may not be the same person.
- **No official record (official directory lists no people for the unit):** Dr. Soumen Basu; Dr. Meenu Rani; Dr. Rakesh Kumar Sharma; Dr. Shilpi Tyagi; Dr. Amit Dhir; Dr. Vikas Sharma; Dr. Pramod Kumar Vaishnav; Dr. Sapanpreet Kaur; Ms. Navdeep Dhillon; Mansi Bhargava; Dr. Apurva Bakshi; Dr. Kavita; Yashpreet Kaur; Dr. Rajesh Dhayal.
- **No official record (not found):** Dr. Kaustuv Roy; Dr. Vikas Tyagi; Dr. Sonam Dullat; Dr. Jitendra Sharma; Mr. Jitender Kaushal; Dr. Debabrata Deb; Dr. Saurabh Malik; Dr. D.P. Singh; Kumar Gaurav (CTO, NCC).
- **Differences** between the published and official values exist for 34 verified people: 33 matched by email, plus Dr. Jainy Sachdeva (published Assistant Professor, official Professor). Mr. Tanuj Chopra's "Mr." / "Dr." is a title-only difference. Most are designations: the official directory is more current or more precise, e.g. "Associate Professor" instead of "Assistant Professor", or contract grades. Name forms also differ, e.g. "Dr. J.P. Kushwaha" / "Dr. Jai Prakash Kushwaha" and "Dr. M.D. Singh" / "Dr. Mandeep Singh-2".
- **Official photos:** the official directory publishes profile photos. The owner accepts them as verified, but the dataset does not store photo URLs: the application has no use for them, and adding them is a separate data change.

**What this does and does not mean:**
- Verification confirms only that the person is TIET faculty or staff with that institutional email, as listed officially.
- It says **nothing about society leadership, appointments or application permissions**. Faculty associations never become Heads or administrators.
- In the application, faculty associations currently stay visible to platform admins only until an admin reviews them. A future import may record officially verified people as verified, if the owner confirms that at import time.
- Faculty photos from the official directory are **not** stored either (unused personal data).

## 6a. Faculty associations (source labels)
Each organisation lists faculty under the source's labels "President", "Vice President" or "Faculty Advisor". These people are TIET faculty coordinators. They are recorded as **faculty associations, exactly as published**, are not given any role or permission in Thapar SNS, and are not shown to students until verified (ADR-0013 §3.5, §8 Q4).

## 7. What a future, approved import must do (not implemented)
1. Re-run the dry run against the target database and show the report to the owner. Stop if anything differs from what the owner approved.
2. In one transaction, for each new record:
   - create the society **inactive, unverified, without a category and without a Head**, with `sourceKey` = key, source URL and fetch date;
   - add its faculty associations, unverified (admin-visible only);
   - write an audit entry (system actor, with the dataset file's SHA-256 and the record key).
3. Skip any `sourceKey` or normalised name that already exists. Overwrite nothing, delete nothing, merge nothing.
4. Leave Head assignment to admins. Activation needs at least one Head; the admin's activation records the profile review.

The schema already supports all of this (ADR-0013 §3.5, §3.6). The apply step is deliberately not written yet.

## 8. All records
Flags: see the JSON for full text. "ref" = a logo link exists (not downloaded).

| # | Name (as published) | Key | Description | Email | Websites | Logo | Faculty verified | Flagged fields | Flags |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ACM Computing Chapter | `acm-computing-chapter` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 2 | AICHE Student Chapter | `aiche-student-chapter` | yes | yes | 1 | ref | 1 of 1 | none | none |
| 3 | Adventure Club | `adventure-club` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 4 | CREATIVE COMPUTING SOCIETY (CCS) | `creative-computing-society-ccs` | yes | yes | 1 | ref | 1 of 2 | websites | website_shared_with, image_on_third_party_host |
| 5 | Chemist’s Association for Research and Education Society (CARE) | `chemists-association-for-research-and-education-society-care` | yes | yes | 1 | ref | 0 of 2 | websites | website_shared_with |
| 6 | Dance Club ‘NOX’ | `dance-club-nox` | yes | yes | **no** | ref | 1 of 2 | none | missing_website |
| 7 | Developer Student Club | `developer-student-club` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 8 | ENACTUS | `enactus` | yes | yes | **no** | ref | 2 of 2 | websiteAsPublished | website_not_a_url |
| 9 | Echoes Club | `echoes-club` | yes | yes | 1 | ref | 0 of 1 | none | none |
| 10 | Economics Club (ECON CLUB) | `economics-club-econ-club` | yes | yes | 1 | ref | 1 of 3 | none | none |
| 11 | Ek Bharat Shreshtha Bharat Club | `ek-bharat-shreshtha-bharat-club` | yes | yes | 1 | ref | 1 of 1 | contactEmail, websites | contact_email_shared_with, website_shared_with |
| 12 | Electoral Club | `electoral-club` | yes | **no** | **no** | ref | 0 of 2 | none | missing_contact_email, missing_website, possible_duplicate_kept_separate |
| 13 | Energy Conservation Club (ECC) | `energy-conservation-club-ecc` | yes | yes | 1 | ref | 1 of 2 | contactEmail, websites | contact_email_shared_with, website_shared_with |
| 14 | Fine Arts and Photography Society (FAPS) | `fine-arts-and-photography-society-faps` | yes | yes | 1 | ref | 1 of 2 | none | none |
| 15 | Frosh | `frosh` | yes | yes | 1 | ref | 6 of 6 | none | name_whitespace_trimmed |
| 16 | GENE | `gene` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 17 | Gender Champions Club | `gender-champions-club` | yes | yes | **no** | ref | 1 of 2 | none | missing_website |
| 18 | GirlUpTIET Society | `girluptiet-society` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 19 | Indian Institute Of Chemical Engineers (IICHE) | `indian-institute-of-chemical-engineers-iiche` | yes | yes | **no** | ref | 1 of 1 | none | missing_website |
| 20 | Indian Society of Technical Education (ISTE) | `indian-society-of-technical-education-iste` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 21 | Institution of Electronics And Telecommunication Engineers (IETE) | `institution-of-electronics-and-telecommunication-engineers-i` | yes | yes | 1 | ref | 1 of 1 | none | none |
| 22 | Institution of Engineers(India) - Student Chapter (IEI) | `institution-of-engineers-india-student-chapter-iei` | yes | yes | **no** | ref | 2 of 2 | none | missing_website |
| 23 | Institution's Innovation Council (IIC) | `institutions-innovation-council-iic` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 24 | International Association of Students in Economics and Commercial Sciences (AIESEC) - Patiala Chapter | `international-association-of-students-in-economics-and-comme` | yes | yes | **no** | ref | 1 of 1 | none | name_longer_than_current_limit_80, missing_website |
| 25 | LEAD SOCIETY | `lead-society` | yes | yes | 1 | ref | 1 of 2 | none | none |
| 26 | Literary Society | `literary-society` | yes | yes | 1 | ref | 1 of 2 | none | none |
| 27 | Materials and Physics Society (MAPS) | `materials-and-physics-society-maps` | yes | yes | **no** | ref | 0 of 2 | none | missing_website |
| 28 | Mechatronics and Robotics Society (MARS) | `mechatronics-and-robotics-society-mars` | yes | yes | **no** | ref | 2 of 2 | none | missing_website |
| 29 | Microsoft Learn Student Chapter | `microsoft-learn-student-chapter` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 30 | Music and Dramatic Society (MUDRA) | `music-and-dramatic-society-mudra` | yes | yes | **no** | ref | 1 of 2 | none | missing_website |
| 31 | National Cadet Corps | `national-cadet-corps` | yes | yes | 1 | ref | 0 of 1 | none | image_on_third_party_host |
| 32 | National Service Scheme | `national-service-scheme` | yes | yes | 1 | ref | 1 of 1 | none | none |
| 33 | OWASP Student Chapter | `owasp-student-chapter` | yes | yes | **no** | ref | 2 of 2 | none | missing_website |
| 34 | Paryavaran Welfare Society (PWS) | `paryavaran-welfare-society-pws` | yes | yes | 1 | ref | 0 of 1 | none | none |
| 35 | Pratigya Society | `pratigya-society` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 36 | ROTARACT CLUB - TIET | `rotaract-club-tiet` | yes | yes | **no** | ref | 1 of 2 | none | missing_website |
| 37 | Society for Community Engineering (SCE) | `society-for-community-engineering-sce` | yes | **no** | **no** | **no** | 2 of 2 | none | missing_contact_email, missing_website, missing_image |
| 38 | Society for Promotion of Indian Classical Music & Culture Amongst Youth (SPIC MACAY) | `society-for-promotion-of-indian-classical-music-and-culture` | yes | yes | 1 | ref | 2 of 2 | none | name_longer_than_current_limit_80 |
| 39 | Society of Automotive Engineers Collegiate Club of TIET | `society-of-automotive-engineers-collegiate-club-of-tiet` | yes | yes | 2 | ref | 2 of 2 | none | multiple_websites_in_one_field |
| 40 | Society of Intelligent Systems (SIS) | `society-of-intelligent-systems-sis` | yes | yes | **no** | ref | 1 of 1 | none | missing_website, image_on_third_party_host |
| 41 | Spiritual Scientists’ Alliance (SSA) | `spiritual-scientists-alliance-ssa` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 42 | Student Alumni Interaction Cell (SAIC) | `student-alumni-interaction-cell-saic` | yes | yes | 1 | ref | 0 of 1 | none | none |
| 43 | TEDx TIET | `tedx-tiet` | yes | yes | 1 | ref | 0 of 1 | none | none |
| 44 | THAPAR VENTURE CLUB (TVC) | `thapar-venture-club-tvc` | yes | yes | 1 | ref | 3 of 3 | none | none |
| 45 | TIET Fitness Club | `tiet-fitness-club` | yes | yes | **no** | ref | 2 of 2 | none | missing_website |
| 46 | TU Toastmasters Club | `tu-toastmasters-club` | yes | yes | 1 | ref | 1 of 2 | none | none |
| 47 | Team Oorja | `team-oorja` | yes | yes | 1 | **no** | 1 of 1 | none | logo_embedded_as_data_uri_in_source_not_kept |
| 48 | Thapar Amateur Astronomers Society (TAAS) | `thapar-amateur-astronomers-society-taas` | yes | yes | 1 | ref | 0 of 1 | none | none |
| 49 | Thapar Electoral Club | `thapar-electoral-club` | yes | yes | 1 | ref | 0 of 2 | contactEmail | contact_email_not_thapar_domain, image_on_third_party_host, possible_duplicate_kept_separate |
| 50 | Thapar Institute Counselling Cell (TICC) | `thapar-institute-counselling-cell-ticc` | yes | yes | 1 | ref | 0 of 1 | none | none |
| 51 | Thapar Mathematical Society | `thapar-mathematical-society` | yes | yes | 1 | ref | 0 of 2 | none | none |
| 52 | Thapar Model United Nations (TUMUN) | `thapar-model-united-nations-tumun` | yes | yes | 1 | ref | 2 of 2 | none | none |
| 53 | Thapar Movie Club (TMC) | `thapar-movie-club-tmc` | yes | yes | 1 | ref | 1 of 1 | none | none |
| 54 | Thapar Society of Civil Engineers (TSCE) | `thapar-society-of-civil-engineers-tsce` | yes | yes | 1 | ref | 3 of 3 | none | none |
| 55 | Thapar Standards Club | `thapar-standards-club` | yes | yes | **no** | ref | 1 of 1 | none | missing_website |
| 56 | Youth United - Thapar Chapter | `youth-united-thapar-chapter` | yes | yes | 1 | ref | 1 of 2 | none | none |
