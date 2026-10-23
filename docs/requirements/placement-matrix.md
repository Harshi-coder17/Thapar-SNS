# Placement Matrix: Definition and Disclosure Control

Requirements PLC-1…PLC-5 are `[APPROVED 2026-10-23]` (text in [requirements.md §7.1](requirements.md)). This document defines **how** they are applied. Items marked `[PROPOSED]` need approval before Slice 4e.

## 1. Purpose and boundaries

- Aggregate-only, **unofficial** view of placement outcomes by year × branch (optionally company).
- No per-student records are collected, stored, imported, or derived. CSV imports containing per-student columns (name, roll number, email, individual CTC) are rejected at import time `[PROPOSED]`.
- Data entry is admin-only (PLC-1). No student self-reporting (PLC-5).
- Every rendered view carries the PLC-4 label and the source citation of the records it aggregates.

## 2. Data model (proposed) `[PROPOSED]`

`placement_records`: id, academic_year, programme, branch, company (nullable), offer_type (FULL_TIME | INTERNSHIP), offer_count, eligible_count (nullable), placed_count (nullable), median_ctc (nullable), ctc_band (nullable, from a fixed band list), source_citation, source_date, created_by, created_at, updated_at. Every write produces an audit-log row (PLC-5).

Constraints: counts ≥ 0; `placed_count ≤ eligible_count`; unique (academic_year, programme, branch, company, offer_type).

## 3. Suppression rules

### 3.1 Primary suppression `[APPROVED k = 5]`
A displayed cell is **suppressed** (shown as "<5", no derived figures) when the number of students it describes is between 1 and 4. The "number of students" is `placed_count` when present, otherwise `offer_count`. A count of 0 is shown as 0 (it reveals no individual's outcome) `[PROPOSED]`.

For a suppressed cell, **all** derived values are also suppressed: placement %, median CTC, CTC band.

### 3.2 Median CTC rule `[PROPOSED]`
Median CTC is shown only when the underlying group has ≥ 5 students **and** the source itself published that median. The system never computes a median from smaller groups or combines medians across records (a median of medians is not a median and can leak values). Min/max are never shown (PLC-3).

### 3.3 Complementary suppression `[PROPOSED]`
Primary suppression alone fails when totals are shown: if a row total is 40 and the other cells sum to 37, the suppressed cell is 3. Therefore:

1. For every row and column that displays a total, if exactly one cell is suppressed, also suppress the **next-smallest** cell in that row/column (complementary suppression).
2. Repeat until no suppressed value can be recovered by subtraction from any displayed total (iterate rows and columns until stable).
3. If a total itself covers 1–4 students, suppress the total too.

### 3.4 Filtering and differencing risks `[PROPOSED]`
Filters (PLC-2) let users request many overlapping aggregates. Comparing "Company X, all branches" with "Company X, all branches except CSE" can reveal a small CSE cell. Controls:

- Filters only use **predefined dimensions**: year, branch, company. There are no free-form queries and no arbitrary branch exclusion sets.
- Suppression (primary + complementary) is re-applied to **every rendered result after filtering**, never to stored data only.
- No "all except" filters. Multi-select combinations are limited to one dimension at a time `[PROPOSED]`.
- Company-level rows require the company-wide total across the selected year to be ≥ 5, otherwise the company is grouped into "Other (<5 offers)" `[PROPOSED]`.
- No CSV/JSON export of the matrix to students `[PROPOSED]`. Exports are admin-only and audit-logged.

### 3.5 Attribute disclosure `[PROPOSED]`
Even with n ≥ 5, a group where **everyone** has the same outcome reveals each member's outcome. Examples: placement 100% or 0%, or every student in one CTC band.
- Placement % is shown as-is (this is common public information) but rounded to whole percent.
- CTC band is shown only if the source reports ≥ 2 distinct bands for that group. Otherwise only the median (if allowed by §3.2) is shown.

## 4. Limitations (re-identification cannot be fully prevented)

- **External knowledge:** someone who knows the other students in a branch, or reads public LinkedIn posts, can sometimes infer an individual's outcome from aggregates. Suppression lowers this risk; it does not remove it.
- **Small programmes:** branches with fewer than 5 students in a year will be almost entirely suppressed. This is intentional.
- **Source accuracy:** data is unofficial and only as accurate as its cited source (LIM-2). The system does not verify it.
- **Over time:** comparing successive edits of a record can reveal changes, e.g. a count changing from 7 to 8. Mitigation: edit history is visible to admins only.
- **k = 5 is a policy choice**, not a guarantee. It can be raised later without schema changes.

## 5. Tests (Slice 4e)

| Test | Expectation |
|---|---|
| Schema test | No per-student columns exist in placement tables |
| Import test | CSV containing name/roll/email/individual CTC columns is rejected |
| Primary suppression | Cells with 1–4 students render "<5", with no %, median or band |
| Complementary suppression | No suppressed cell can be recovered by subtracting displayed cells from any displayed total (property-based test over random matrices) |
| Filter re-application | Every filter combination returns suppression-safe output |
| Differencing | No allowed filter pair reveals a suppressed value |
| Labelling | PLC-4 label and citation present on every view (E2E) |
| Audit | Each create/update/delete writes an audit row |
