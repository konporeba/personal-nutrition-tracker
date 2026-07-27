# Structured Day View (S-06) Implementation Plan

## Overview

Turn Today from one flat chronological list into the PRD's five fixed sections —
breakfast, snack, lunch, bite, supper — each always visible with its own calories +
macro subtotal, and add a way to move a logged entry into a different section after
the fact. No schema or backend work: `meal_entries.section` and `updateMealEntry`
already exist from S-01; this slice is entirely the view layer that was deferred
when S-01 shipped.

## Current State Analysis

**The data and default-inference seams are already built and are not touched by this
plan:**

- `meal_entries.section` is `NOT NULL` on the five-value `entry_section` enum
  (`src/data/types.ts:7,24`), and every entry committed since S-01 already carries one,
  inferred at commit time by `sectionForTime()` (`src/lib/section-for-time.ts`,
  wired at `src/app/(today)/review.tsx:120`).
- `updateMealEntry(id, patch)` (`src/data/meal-entries.repo.ts:63`) already accepts a
  `section` patch via `MealEntryPatch` (`src/data/types.ts:71-85`) — it is defined but
  has **zero callers** anywhere in `src/` (verified by grep). This plan is its first
  consumer.
- `listMealEntriesForDay` already returns a day's entries in ascending `logged_at`
  order (`src/data/meal-entries.repo.ts:57`), which is the order each section should
  preserve.

**What's missing is entirely presentational:**

- `src/app/(today)/index.tsx` renders one flat `FlatList` with a single pinned
  `DayTotal` header (day-level calories + macro bars, `src/components/day-total.tsx`).
  There is no grouping, no per-section subtotal, and no way to reassign an entry's
  section.
- `MealEntryRow` (`src/components/meal-entry-row.tsx`) binds `onLongPress` to delete
  and has no `onPress` — the tap gesture is free to claim for re-sectioning.
- `sum-calories.ts` / `sum-macros.ts` are dependency-free pure functions already used
  by `DayTotal`; the same functions apply unchanged per-section.
- There is no `Modal` usage anywhere in the codebase yet — the "Move to…" sheet in
  Phase 2 is the first.

### Key Discoveries:

- RN's `SectionList` renders a section's header even when that section's `data` array
  is empty — it does not hide empty sections by default. This is exactly the behavior
  "always show all 5 sections" needs, with no placeholder row or extra logic required
  for the empty case.
- The five-section order (`breakfast, snack, lunch, bite, supper`) is already fixed by
  the `Section` union's declaration order (`src/data/types.ts:7`) and mirrors FR-056 —
  a `SECTION_ORDER` constant in the new grouping helper is the single place this order
  is spelled out for the UI.
- The existing "long-press deletes, no confirm" design (`meal-entry-row.tsx:6-8`)
  means the row's tap gesture was deliberately left free — confirmed by the planning
  questions, re-sectioning claims it without touching delete.

## Desired End State

Opening Today shows five section headers in fixed order, each showing its name and a
calories + macro-chip subtotal, with that section's entries listed beneath it in
chronological order — including sections with zero entries, which still show their
header and a 0 kcal subtotal. The day-level `DayTotal` above the sections is
unchanged. Tapping a logged entry opens a "Move to…" sheet listing the other four
sections; picking one re-sections the entry and both its old and new section
subtotals (and the entries under them) update immediately, with the day total
unaffected since the entry's macros don't change. Long-press still deletes, unchanged.

**Verification:** `npm run smoke:day-view` passes (grouping, subtotal math, and a live
section-move round-trip against the deployed backend), `tsc --noEmit` and
`npm run lint` are clean, and a manual walkthrough on both a populated and a
mostly-empty day confirms the visual and interaction behavior above.

## What We're NOT Doing

- No section picker on the review/commit screen (`review.tsx`) — section stays
  inferred-then-fixed at commit time; correcting it is only ever done afterward via
  the new move action. (Planning decision: "Move-after only".)
- No sticky section headers — they scroll with the content like any other row.
- No visual emphasis on the section matching the current time of day.
- No swipe gestures, drag-and-drop, or multi-select for re-sectioning — a single tap
  opens a sheet with a single-tap choice.
- No changes to `DayTotal`, the day-level progress bars, or the budget/target math —
  FR-030's "adjusted budget" stays exactly as S-01/S-02 left it.
- No per-component (OQ-6) breakdown inside a section — that's S-07's meal-detail
  scope, unaffected here.

## Implementation Approach

Build one new pure, dependency-free grouping helper (matching the existing
`sum-calories.ts` / `sum-macros.ts` / `section-for-time.ts` pattern) that turns a
day's flat entry list into the five fixed section groups with their subtotals
pre-computed. Swap Today's `FlatList` for RN's `SectionList` driven by that helper,
add a section-header component, then layer the move action on top as its own
self-contained hook + sheet component + one new `onPress` wire-up on
`MealEntryRow`. Verification follows the established per-slice smoke-script
convention (`log-smoke.ts` → `smoke:log`), adding `day-view-smoke.ts` → `smoke:day-view`.

## Critical Implementation Details

### SectionList and empty sections

Passing all five `SECTION_ORDER` entries as `SectionList` sections — even the ones
whose `data` array is empty — is sufficient by itself to satisfy "always show all 5";
`SectionList` renders `renderSectionHeader` per section regardless of whether that
section's `data` is empty. Don't add a conditional to hide or skip empty sections, and
don't add a placeholder "nothing logged" row inside an empty section — the header with
its 0 kcal subtotal is the whole treatment.

---

## Phase 1: Section grouping and the restructured Today view

### Overview

Introduce the grouping helper and switch Today from a flat list to five always-present
sections, each with its own subtotal, with no behavior change to re-sectioning yet
(that's Phase 2).

### Changes Required:

#### 1. Section-grouping helper

**File**: `src/lib/group-by-section.ts`

**Intent**: A total, pure function that turns a day's flat `MealEntry[]` into the five
fixed section groups in FR-056 order, each carrying its own entries (already
chronological from the query) and pre-computed calories/macro subtotals — reusing
`sumCalories`/`sumMacros` rather than re-deriving totals ad hoc in the component layer.

**Contract**: Exports `SECTION_ORDER: Section[]` (the fixed five, in order) and
`groupEntriesBySection(entries: MealEntry[]): SectionGroup[]`, where `SectionGroup` is
`{ section: Section; entries: MealEntry[]; calories: number; macros: MacroTotals }`.
One group per `SECTION_ORDER` entry, always, regardless of whether that section has any
matching entries.

#### 2. Section header / subtotal display

**File**: `src/components/section-subtotal.tsx`

**Intent**: Render a section's name alongside its calories + macro-chip subtotal
(e.g. "Breakfast · 620 kcal · 40P 60C 20F"), following `DayTotal`'s existing visual
language (`ThemedText`/`ThemedView`, `Spacing` scale) but as a lighter section-level
header rather than the day's progress bars.

**Contract**: Takes `{ section: Section; calories: number; macros: MacroTotals }` and
renders a labelled header row. Section names are title-cased from the `Section` union
value (`breakfast` → "Breakfast"). Macro chips reuse the same rounding convention
`DayTotal` already applies (`Math.round`).

#### 3. Today screen restructure

**File**: `src/app/(today)/index.tsx`

**Intent**: Replace the flat `FlatList` with a `SectionList` driven by
`groupEntriesBySection(entries)`, rendering `SectionSubtotal` as
`renderSectionHeader` and `MealEntryRow` as `renderItem`, with
`stickySectionHeadersEnabled={false}` (the "scroll normally" decision). `DayTotal`
stays exactly where it is today, inside `ListHeaderComponent`.

**Contract**: The five groups become `SectionList`'s `sections` prop
(`{ title, data, calories, macros }` per group, `data` being that section's
`entries`); `keyExtractor` keeps using `entry.id`. The empty-day/loading/error states
(`EmptyState`) are unaffected — they still show when the day has zero entries across
every section (no rows to render, but Phase 1's "always show all 5" still applies, so
the five empty-section headers render above the existing `EmptyState` copy).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Today shows all five section headers, in fixed order, on a day with entries in only
  some sections — sections with no entries still show their header and a 0 kcal
  subtotal
- Each section's subtotal (calories + macro chips) matches the sum of that section's
  visible rows
- Entries within a section remain in chronological (earliest-first) order
- The day-level `DayTotal` above the sections is unchanged and still reflects the full
  day's total regardless of section boundaries
- Section headers scroll with the content (no sticky pinning)

---

## Phase 2: Move an entry between sections

### Overview

Add the FR-064 re-sectioning action: tapping a logged entry opens a "Move to…" sheet:
picking a different section updates the entry, its old section, and its new section
in place.

### Changes Required:

#### 1. Section-update mutation hook

**File**: `src/data/use-meal-entries.ts`

**Intent**: A `useUpdateMealEntrySection` hook that wraps the already-existing
`updateMealEntry`, following the exact invalidation pattern `useDeleteMealEntry`
already uses — invalidate the day query key derived from the entry's own
`logged_at`, so a move updates the list whichever day it landed in (there's a
day-boundary case if an entry sits exactly at midnight, but that's unaffected by
section moves and already handled by the existing key derivation).

**Contract**: `useUpdateMealEntrySection()` returns a mutation taking
`{ id: string; logged_at: string; section: Section }` and resolving to the updated
`MealEntry`; `onSuccess` invalidates `queryKeys.mealEntries.day(new Date(entry.logged_at))`.

#### 2. "Move to…" sheet

**File**: `src/components/move-section-sheet.tsx`

**Intent**: A small modal listing all five sections (the entry's current section shown
as selected/disabled, the other four tappable), so picking one closes the sheet and
fires the move. Built on RN's built-in `Modal` — no new dependency, consistent with
the project's home-grown-theming stance (no component library).

**Contract**: Takes `{ visible: boolean; currentSection: Section; onSelect: (section: Section) => void; onRequestClose: () => void }`. Tapping the backdrop or a
Cancel affordance calls `onRequestClose` without selecting; tapping a non-current
section calls `onSelect` with that section.

#### 3. Wire the row and screen together

**File**: `src/components/meal-entry-row.tsx`, `src/app/(today)/index.tsx`

**Intent**: Give `MealEntryRow` an `onPress` (previously unset) that opens the sheet
for that row's entry; `index.tsx` owns the sheet's open/closed state (which entry, if
any, is being moved) and calls the new mutation on selection. A move error surfaces
the same inline way the existing delete error does ("Couldn't move that entry. Try
again."), reusing that pattern rather than introducing a new error-display convention.

**Contract**: `MealEntryRow` gains an optional `onPress?: () => void` prop alongside
the existing `onLongPress`. `index.tsx` tracks the entry currently targeted for a
move (or none) in local state; the mutation is disabled while already pending, so a
second tap during the round trip can't fire a duplicate update.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Tapping an entry opens the "Move to…" sheet listing the other four sections (not
  the entry's current one, or showing it clearly disabled)
- Picking a section closes the sheet, moves the entry, and both the old and new
  section's subtotals and entry lists update without a manual refresh
- The day-level total is unchanged by a move (only the section assignment changed,
  not any macro value)
- Long-press on a row still deletes it, unaffected by the new tap behavior
- A failed move surfaces an inline error message and leaves the entry in its original
  section
- The sheet behaves correctly on both a native build and web (RN `Modal` has no prior
  usage in this codebase to confirm against)

---

## Phase 3: Smoke coverage

### Overview

Add machine-checked coverage for the new grouping/subtotal logic and the
move-between-sections round trip, following the established per-slice smoke-script
convention (`log-smoke.ts` / `npm run smoke:log`).

### Changes Required:

#### 1. Day-view smoke script

**File**: `scripts/day-view-smoke.ts`

**Intent**: Assert the claims this slice makes that aren't visible from a single
manual pass: `groupEntriesBySection` always returns all five sections in fixed order
regardless of which sections have entries, per-section subtotals match
`sumCalories`/`sumMacros` over just that section's entries, and moving a real
committed entry's section via `updateMealEntry` round-trips through
`listMealEntriesForDay` — the entry appears under its new section and no longer under
its old one, and the day's total calories are unchanged by the move. Mirrors
`log-smoke.ts`'s structure: sign in as the owner, create real entries against the
deployed backend, assert, then hard-delete everything created in a `finally`.

**Contract**: A `main()` that authenticates, seeds a couple of entries across
different sections, exercises `groupEntriesBySection` (pure, no network) plus one
live `updateMealEntry` section-move, asserts, and cleans up — same shape as
`log-smoke.ts`.

#### 2. Bundler entry point and npm script

**File**: `scripts/run-day-view-smoke.mjs`, `package.json`

**Intent**: Bundle-and-run `day-view-smoke.ts` under Node exactly as
`run-log-smoke.mjs` does for `log-smoke.ts` (same `esbuild` shim for the
platform-split `@/lib/supabase` and `@/lib/new-id` modules), and add a
`smoke:day-view` script alongside the existing `smoke:*` entries.

**Contract**: `scripts/run-day-view-smoke.mjs` is `run-log-smoke.mjs` with its
`entryPoints` swapped to `scripts/day-view-smoke.ts`; `package.json` gains
`"smoke:day-view": "node --env-file=.env --env-file-if-exists=.env.local scripts/run-day-view-smoke.mjs"`.

### Success Criteria:

#### Automated Verification:

- Day-view smoke passes: `npm run smoke:day-view`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Full walkthrough on a real day: open Today, confirm all five sections render in
  order with correct subtotals, move an entry between sections, confirm subtotals and
  day total behave as expected, confirm delete is still unaffected

---

## Testing Strategy

### Unit Tests:

- No test runner is configured in this repo (per `CLAUDE.md`); coverage instead comes
  from the pure-function assertions inside `day-view-smoke.ts`, matching every prior
  slice's approach.

### Integration Tests:

- `day-view-smoke.ts` exercises the live round trip: create entries in known
  sections → group them → move one via `updateMealEntry` → read the day back →
  assert the new grouping and unchanged day total.

### Manual Testing Steps:

1. Open Today on a day with entries spread across some but not all sections; confirm
   all five headers appear in order with correct subtotals, including 0 kcal for
   empty ones.
2. Tap an entry, confirm the "Move to…" sheet lists the other four sections, pick
   one, and confirm both affected sections' subtotals update immediately.
3. Long-press an entry and confirm it still deletes with no confirmation step,
   unaffected by the new tap behavior.
4. Repeat the open + move steps on web to confirm the `Modal`-based sheet renders and
   behaves correctly there too.

## Performance Considerations

None beyond what already exists — `groupEntriesBySection` is a single pass over a
day's entries (at most a handful per day per the PRD's ~3-8 entries/day NFR), computed
once per render alongside the existing `sumCalories`/`sumMacros` calls `DayTotal`
already makes.

## Migration Notes

None — no schema change, and every existing entry already carries a valid `section`
value from S-01 onward, so there is no backfill.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-06: structured-day-view)
- PRD requirements: FR-056, FR-057, FR-058, FR-059, FR-060, FR-061, FR-064, FR-030
- Prior slice establishing `section`/`sectionForTime`: `context/archive/2026-07-24-free-text-meal-logging/plan.md`
- Existing subtotal math to reuse: `src/lib/sum-calories.ts`, `src/lib/sum-macros.ts`
- Existing smoke-script pattern to mirror: `scripts/log-smoke.ts`, `scripts/run-log-smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Section grouping and the restructured Today view

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — 490ba09
- [x] 1.2 Linting passes: `npm run lint` — 490ba09

#### Manual

- [x] 1.3 Today shows all five section headers, in fixed order, on a day with entries in only some sections — sections with no entries still show their header and a 0 kcal subtotal — 490ba09
- [x] 1.4 Each section's subtotal (calories + macro chips) matches the sum of that section's visible rows — 490ba09
- [x] 1.5 Entries within a section remain in chronological (earliest-first) order — 490ba09
- [x] 1.6 The day-level DayTotal above the sections is unchanged and still reflects the full day's total regardless of section boundaries — 490ba09
- [x] 1.7 Section headers scroll with the content (no sticky pinning) — 490ba09

### Phase 2: Move an entry between sections

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — 622d4d8
- [x] 2.2 Linting passes: `npm run lint` — 622d4d8

#### Manual

- [x] 2.3 Tapping an entry opens the "Move to…" sheet listing the other four sections (not the entry's current one, or showing it clearly disabled) — 622d4d8
- [x] 2.4 Picking a section closes the sheet, moves the entry, and both the old and new section's subtotals and entry lists update without a manual refresh — 622d4d8
- [x] 2.5 The day-level total is unchanged by a move — 622d4d8
- [x] 2.6 Long-press on a row still deletes it, unaffected by the new tap behavior — 622d4d8
- [x] 2.7 A failed move surfaces an inline error message and leaves the entry in its original section — 622d4d8
- [x] 2.8 The sheet behaves correctly on both a native build and web — 622d4d8

### Phase 3: Smoke coverage

#### Automated

- [x] 3.1 Day-view smoke passes: `npm run smoke:day-view`
- [x] 3.2 Type checking passes: `npx tsc --noEmit`
- [x] 3.3 Linting passes: `npm run lint`

#### Manual

- [x] 3.4 Full walkthrough on a real day: open Today, confirm all five sections render in order with correct subtotals, move an entry between sections, confirm subtotals and day total behave as expected, confirm delete is still unaffected
