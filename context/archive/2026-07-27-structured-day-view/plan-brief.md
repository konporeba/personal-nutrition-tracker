# Structured Day View — Plan Brief

> Full plan: `context/changes/structured-day-view/plan.md`

## What & Why

Roadmap slice S-06: turn Today from one flat chronological list into five fixed
sections — breakfast, snack, lunch, bite, supper — each showing its own subtotal, so
the owner can tell at a glance where their calories are going across the day (US-10),
and can fix a wrongly-inferred section after the fact (FR-064).

## Starting Point

S-01 already writes a required `section` on every entry, inferred by
`sectionForTime()` at commit time, and the repo already exposes `updateMealEntry`
with a `section` patch — but nothing calls it yet. Today currently renders a single
flat list with one day-level total (`DayTotal`); there is no grouping, no per-section
subtotal, and no way to move an entry once logged. This plan is pure view-layer work
on top of an already-complete data model.

## Desired End State

Opening Today shows five section headers in fixed order, each with a calories +
macro-chip subtotal, sections with no entries included. Tapping a logged entry opens
a "Move to…" sheet to reassign its section; long-press still deletes, unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Empty sections | Always show all 5 | FR-057 explicitly allows zero-entry sections; an empty section is itself informative | Plan |
| Subtotal content | Calories + macro chips | Matches FR-059's literal wording, reuses existing `sum-macros.ts` at no extra cost | Plan |
| Re-section trigger | Tap opens a "Move to…" sheet | Long-press is already claimed by delete; a sheet avoids gesture conflict and generalizes to future edit actions (S-07) | Plan |
| Section headers | Scroll inline, not sticky | Only 5 sections with a handful of entries each — sticky pinning adds chrome for little benefit | Plan |
| Current-time emphasis | None | Avoids a highlight that goes stale as soon as an entry is freely reassignable | Plan |
| Entry order within a section | Chronological ascending | Matches the existing day-query order; no new sort logic | Plan |
| Section correction at commit time | Deferred — move-after only | Keeps `review.tsx` untouched; FR-064's move action already covers the correction case | Plan |
| Scope cuts if time-constrained | None — all must-have | FR-056/057/058/059/064 are all must-have priority in the PRD; nothing here is optional | Plan |

## Scope

**In scope:**
- Grouping a day's entries into the five fixed sections, always rendered
- Per-section calories + macro subtotal display
- Moving a logged entry to a different section via a tap-triggered sheet
- Smoke-script coverage for grouping, subtotal math, and the move round trip

**Out of scope:**
- A section picker on the review/commit screen (`review.tsx`)
- Sticky headers, current-section highlighting, swipe/drag gestures
- Any change to `DayTotal`, targets, or budget math
- Per-component (OQ-6) breakdown — that's S-07's scope

## Architecture / Approach

One new pure helper (`group-by-section.ts`, following the existing
`sum-calories.ts`/`section-for-time.ts` pattern) turns a day's flat entry list into
five fixed groups with pre-computed subtotals. Today's `FlatList` becomes a
`SectionList` driven by that helper. Re-sectioning is a self-contained addition on
top: a new mutation hook wrapping the already-existing `updateMealEntry`, a `Modal`
-based sheet, and one new `onPress` on `MealEntryRow`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Section grouping & restructured view | All 5 sections always visible with subtotals, replacing the flat list | None significant — pure view restructure over data that already exists |
| 2. Move between sections | Tap-to-open sheet reassigns an entry's section | RN `Modal` has no prior usage in this codebase — first check its web behavior |
| 3. Smoke coverage | `day-view-smoke.ts` asserting grouping, subtotals, and a live move round trip | None — mirrors the proven `log-smoke.ts` pattern |

**Prerequisites:** S-01 (entries with a `section`), S-05 (icons on rows) — both already shipped.
**Estimated effort:** ~1 session across 3 phases; no schema or backend work.

## Open Risks & Assumptions

- RN's built-in `Modal` is untested on web (`react-native-web`) in this codebase —
  Phase 2's manual verification explicitly checks both platforms before considering
  the sheet done.
- The section time boundaries (OQ-10) remain provisional, unchanged by this plan —
  this slice only changes how sections are displayed and reassigned, not how they're
  inferred.

## Success Criteria (Summary)

- Every day, populated or not, shows all five sections in fixed order with correct
  subtotals that sum to the day total
- The owner can move any logged entry into a different section in one tap-and-pick,
  with no change to that entry's macros or the day's total
- Long-press delete keeps working exactly as before
