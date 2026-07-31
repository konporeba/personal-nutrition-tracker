<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Analytics and Trends (S-11)

- **Plan**: context/changes/analytics-and-trends/plan.md
- **Scope**: Phase 1 of 7 through Phase 7 of 7 (full plan)
- **Date**: 2026-07-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Unbatched daily-target backfill can burst up to ~60 requests on first cold Analytics open

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — already an accepted, documented risk; no action required
- **Dimension**: Safety & Quality
- **Location**: src/data/use-analytics.ts:90-101
- **Detail**: The backfill `useEffect` loops over every day in the range missing a `daily_targets` snapshot and fires one `ensureDailyTarget()` per day (2 sequential round trips each: upsert + re-select). A first-time 30-day view against pre-existing data can burst up to ~60 requests. This is the same risk flagged as F4 during `/10x-plan-review` and explicitly accepted there — the plan's "Performance Considerations" section already documents it as harmless at this app's single-owner scale. Re-surfaced here only because the implementation matches what was already accepted, not because it's new.
- **Fix**: Optional follow-up, not required now — add a bulk `ensureDailyTargetsBatch(days, targets)` doing one multi-row upsert + one range re-select, mirroring `getDailyTargetsForRange`'s shape.

## Observations

### F2 — Backfilled snapshot isn't invalidated into the current query result

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/data/use-analytics.ts:90-101
- **Detail**: After `ensureDailyTarget` succeeds, nothing calls `queryClient.invalidateQueries` on `queryKeys.analytics.range(...)`, so the just-persisted snapshot isn't reflected in `query.data.snapshots` until the next natural refetch. Harmless today — the render already falls back to `currentTargets`, the exact value being persisted — but a remount before that refetch re-runs `ensureDailyTarget` for the same days again (idempotent, just wasted round trips).
- **Fix**: Optional — invalidate `queryKeys.analytics.range(...)` after the backfill `Promise.all` settles, if the redundant idempotent calls ever become worth avoiding.

### F3 — Magic number instead of the `Spacing` scale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(analytics)/day.tsx:68 (`missing: { ..., gap: 8 }`)
- **Detail**: Every other style block across this feature's new files uses the `Spacing` scale per CLAUDE.md's theming rule; this one raw `8` should be `Spacing.two`.
- **Fix**: Replace `gap: 8` with `gap: Spacing.two` and import `Spacing` from `@/constants/theme`.

## Supporting evidence

- **Plan drift**: 0 files MISSING, 0 undocumented EXTRA. All 30 changed/new files (excluding the change folder) map cleanly to their phase's "Changes Required." The two deliberate deviations from the plan's literal text — the forward-path `{input, targets}` mutation shape (F3 from the plan review) and the non-partial `daily_targets` unique index (F1 from the plan review) — are both implemented exactly as documented in commit messages and in-file comments.
- **What We're NOT Doing compliance**: PASS — no per-component decomposition, no custom date range beyond 7d/30d, `showComposer={false}` blocks composing into past days, no chart pan/zoom/tooltip, no weight rate-of-change/ETA math.
- **Security**: no injection risk (fluent supabase-js builder throughout), `daily_targets` RLS mirrors `training_sessions` exactly (4 owner-scoped policies), no hardcoded secrets.
- **Reliability**: every repo function throws on `error`; fire-and-forget mutations consistently use `.catch(err => console.error(...))`; `ensureDailyTarget`'s insert-if-absent race is atomic at the DB level (verified live by `scripts/analytics-smoke.ts`'s immutability test).
- **Data safety**: `daily_targets` is a new table (no existing-row impact); `profile.target_weight_kg` is additive/nullable with a sane CHECK constraint, no backfill needed.
- **Success criteria**: all automated checks (smoke:analytics × 7 assertions, full smoke suite, lint, tsc) passed as of commit a8baa61. All manual checks in the plan's Progress section are `[x]` with commit SHAs; each was gated behind an explicit user confirmation during implementation (not self-certified) — see the AskUserQuestion exchanges for Phases 2, 4, 5, 6, and 7 in this session.

## Decisions

- **F1**: SKIPPED — already accepted during plan review (F4); harmless at single-owner scale.
- **F2**: SKIPPED — self-healing, no observable bug.
- **F3**: FIXED — `gap: 8` → `gap: Spacing.two` in `src/app/(analytics)/day.tsx`.
