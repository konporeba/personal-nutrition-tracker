<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Analytics and Trends (S-11)

- **Plan**: context/changes/analytics-and-trends/plan.md
- **Mode**: Deep
- **Date**: 2026-07-31
- **Verdict**: REVISE (all findings fixed in this pass — see Decisions)
- **Findings**: 2 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL (fixed) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL (fixed) |
| Plan Completeness | WARNING (fixed) |

## Grounding

12/12 paths ✓, migration precedents ✓ (`profile.repo.ts:45` is the only existing upsert, targets a non-partial unique constraint), brief↔plan ✓. Riskiest claims verified against live code via sub-agent (day-ledger signature, `useDayEntries`/`useDaySessions` optional-date behavior, day-boundary math, `ensureDailyTarget`'s `ON CONFLICT` semantics, mutation `onSuccess` structure) plus a blast-radius sweep of callers.

## Findings

### F1 — ensureDailyTarget's ON CONFLICT target won't resolve against a partial unique index

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — `daily_targets` migration + `daily-targets.repo.ts`
- **Detail**: The unique index was specified as `(owner_id, day) WHERE deleted_at IS NULL` (partial). Postgres's `ON CONFLICT` arbiter inference requires an exact match to a non-partial unique index unless the `ON CONFLICT` clause repeats the predicate — and supabase-js's `onConflict` option can't pass a `WHERE` predicate. The only existing upsert in the codebase (`profile.repo.ts:45`) targets a plain, non-partial constraint. As specified, the insert would error at write time.
- **Fix**: Make the `(owner_id, day)` unique index non-partial. No phase ever soft-deletes a `daily_targets` row.
- **Decision**: FIXED — Phase 1's migration contract updated to drop the partial predicate, with the reasoning inlined.

### F2 — Past-day drill-into-entry breaks: meal-detail/session-detail default to today, not the tapped day

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 6 — Past-day route / chart-tap wiring
- **Detail**: Phase 6 claimed `meal-detail.tsx`/`session-detail.tsx` were "already day-agnostic." Verified false — both call `useDayEntries()`/`useDaySessions()` with no date argument (defaulting to today) and find the tapped entry by filtering *that* day's list by `id`. A past-day entry tap would render `MissingMealEntry`, contradicting Phase 6's own manual success criterion 6.4.
- **Fix**: Thread `date` as a route param from `(analytics)/day.tsx` into both detail screens; call `useDayEntries(date)`/`useDaySessions(date)` there instead of the no-arg default.
- **Decision**: FIXED — Phase 6's route-param contract updated; `meal-detail.tsx`/`session-detail.tsx` added to the phase's touched-files list.

### F3 — Forward-path snapshot capture calls a hook from outside render

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details — daily-target snapshot capture
- **Detail**: The plan had `useCreateMealEntry`/`useCreateTrainingSession`'s `onSuccess` calling `useTargets()` directly — illegal, since a mutation's `onSuccess` is a plain callback, not a render/hook context.
- **Fix A ⭐ (chosen)**: Calling screen reads `useTargets()` and passes the value into the mutation's input variables; `onSuccess` uses the passed-in value.
  - Strength: capture logic stays in one place (the mutation hook).
  - Tradeoff: couples the mutation's input shape to targets.
- **Fix B (not chosen)**: Define `onSuccess` at the call site instead, calling `useTargets()` there.
  - Strength: mutation hook stays untouched.
  - Tradeoff: every future call site must remember to wire the side effect.
- **Decision**: FIXED via Fix A — Critical Implementation Details paragraph rewritten to pass `Targets` through the mutation's input variables.

### F4 — First-open backfill can fire up to 30 concurrent inserts

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: Phase 2 — `useAnalyticsRange`
- **Detail**: Opening a 30-day Analytics view for the first time can fire up to 30 individual fire-and-forget `ensureDailyTarget` inserts, not covered by Phase 2's "one query per table" performance claim.
- **Fix**: One-line acknowledgment in Performance Considerations.
- **Decision**: FIXED — Performance Considerations section now notes the backfill-write caveat.

## Summary

All 4 findings addressed directly in `plan.md` during this review. No pending decisions remain — the plan is ready for `/10x-implement` (or `/10x-tdd`).
