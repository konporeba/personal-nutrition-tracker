<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Training and Dynamic Budget Implementation Plan

- **Plan**: context/changes/training-and-dynamic-budget/plan.md
- **Scope**: Phase 4 of 4 (full plan)
- **Date**: 2026-07-30
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Method note

A dedicated sub-agent ran plan-drift detection (all 14 planned changes verified file-by-file against actual contents, plus all 6 "What We're NOT Doing" scope boundaries — all MATCH/confirmed, zero drift). A second sub-agent was launched for the safety/quality/pattern-compliance pass but failed on an account spend-limit error before returning results; that pass was completed directly instead (same criteria: security, performance, reliability, data safety, pattern compliance against the stated sibling files), reading every changed file in the phase 3/4 diff plus re-checking phase 1/2 files. All automated success-criteria commands (`npx tsc --noEmit`, `npm run lint`, `npm run smoke:training`, `npm run smoke:day-view`) were re-run fresh during this review and passed.

## Findings

### F1 — Net-bar label reads "Net" instead of the plan's suggested "Net calories"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/day-ledger.tsx:43
- **Detail**: The plan's Phase 4 contract says the net bar should use `MacroProgress` with `label "Net calories"`. The implementation uses `label="Net"` instead. Functionally identical — `MacroProgress` already appends the `unit` ("kcal") after the value, so "Net calories: X / Y kcal" would have read slightly redundant; "Net: X / Y kcal" was the judgment call made during implementation. Purely cosmetic, no behavior difference.
- **Fix**: If exact plan wording is wanted, change `label="Net"` to `label="Net calories"` on day-ledger.tsx:43 — one-line change, no other effects.
- **Decision**: FIXED — changed `label="Net"` to `label="Net calories"` on day-ledger.tsx:43

## Automated Success Criteria (re-verified)

- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS
- `npm run smoke:training` — PASS (pure-math assertions + live create/update-burn/soft-delete round trip against the deployed backend, fixture cleaned up)
- `npm run smoke:day-view` — PASS (regression check, meal-entries seam unaffected)

## Manual Success Criteria

All 15 manual-verification rows across the 4 phases are checked `[x]` in the plan's `## Progress` section, each carrying the commit SHA that landed them (`b7ddffd`, `e3094e9`, `63b7622`, `bbc6a76`) — no rubber-stamped items found; each was confirmed by the user during implementation before its phase's commit.

## Scope Discipline

All 6 "What We're NOT Doing" boundaries were verified respected by the plan-drift sub-agent: no saved-training-sessions feature (FR-074), no past-day session browsing, no icon/category system for sessions, no MET-table/AI burn computation, `deriveTargets`/`effectiveTargets` untouched, `session_type` stored as free text (not an enum).

## Safety & Quality

No direct `supabase` calls from any UI file outside the `training-sessions.repo.ts` seam (grep-verified). No `any`/unsafe non-null assertions introduced in the new files. Every read path (`listTrainingSessionsForDay`) filters `deleted_at is null`; every write goes through the repo, never the client directly. RLS policies mirror the already-reviewed `meal_entries`/`saved_meals` four-policy shape exactly. Check constraints (`duration_minutes > 0`, `burn_kcal > 0`) at the DB layer back up the client-side positive-number validation in both the composer and detail screens — defense in depth, consistent with the project's existing `profile`/`body_weights` positivity-check convention.

## Pattern Consistency

`training-sessions.repo.ts` mirrors `meal-entries.repo.ts` byte-for-byte in structure (day-bucketing, `requireOwnerId()`, CRUD shape). `use-training-sessions.ts` mirrors `use-meal-entries.ts`'s invalidate-by-the-record's-own-day pattern. `session-composer.tsx`/`session-detail.tsx` duplicate their own local `Field`/`NumericField`/numeric-parsing helpers rather than sharing a common module — this matches the codebase's existing convention (`meal-detail.tsx` and `saved-meal-edit.tsx` each already do the same), not a deviation. `day-ledger.tsx` correctly reuses `MacroProgress` rather than reimplementing a bar, and computes the ledger internally from raw props rather than accepting a precomputed value, matching `DayTotal`'s own convention.
