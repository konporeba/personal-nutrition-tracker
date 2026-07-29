# Training and Dynamic Budget — Plan Brief

> Full plan: `context/changes/training-and-dynamic-budget/plan.md`

## What & Why

Let the owner log a training session (type, intensity, duration, and an owner-entered calorie burn) and see the day as a two-sided ledger — calories in, calories out, and net against an adjusted budget. A hard training day earns back calories; a rest day doesn't. This is roadmap slice S-09 (PRD US-14, US-15, FR-070–075) and it's what makes FR-030's "adjusted budget" real for the first time — until now, Today's header only ever compared consumed calories to the flat resting target.

## Starting Point

`src/lib/derive-targets.ts` already computes a fixed sedentary-baseline resting target (Model A) and explicitly notes training is added later, never baked in. Today's header (`day-total.tsx`) shows consumed-vs-target progress bars with no burn concept at all. There is no `training_sessions` table, repo, or UI — this is a net-new vertical slice built on top of the already-shipped profile/targets (S-02) and structured day view (S-06).

## Desired End State

The owner taps "Log training" next to "Saved meals" on Today, fills in a short form, and the session appears in a Training list. A new ledger card shows in/out/net calories, with net shown as a progress bar against the resting target — so a hard session visibly opens up more room to eat. Editing or deleting a session updates the ledger immediately.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| UI placement | Embedded in Today (new list + dedicated composer/detail screens) | Matches US-14's "see intake, expenditure, and net side by side" and reuses Today's existing scaffolding |
| Session type & intensity | Free-text type, enum intensity (low/moderate/high) | Type is far more varied than food category; neither field feeds any calculation (burn is owner-entered directly) |
| Duration | Integer minutes | Matches the numeric-field pattern already used for calories/weight |
| Ledger display | New `DayLedger` component + pure `computeDayLedger()` lib function | Keeps arithmetic testable in isolation (matches `derive-targets.ts`'s pattern) without touching the existing `DayTotal` |
| Saved sessions (FR-074) | Deferred to a follow-up slice | Roadmap marks it optional/nice-to-have; needs real repeat-session data first |
| Burn validation | Required, positive numeric | FR-071's entire point is the owner-entered burn — a burn-less session would sit inert in the ledger |
| No-target behavior | Show burned total regardless of profile/target state | Training logging must never depend on profile setup being complete |
| Smoke coverage | Yes — new `scripts/training-smoke.ts` | Matches the project's only test-coverage convention (dependency-free `src/lib` math asserted by a Node smoke script) |

## Scope

**In scope:** `training_sessions` table + repo + hooks; log/edit/delete session UI; day ledger (in/out/net) on Today; smoke coverage for the ledger math.

**Out of scope:** saved/one-tap sessions (FR-074); browsing/editing sessions on past days (S-11); any icon system for sessions; MET-table or AI-computed burn; any change to `deriveTargets`/`effectiveTargets`.

## Architecture / Approach

A `training_sessions` table mirrors `meal_entries`' shape (day-bucketed log, soft delete, owner-scoped RLS) rather than `profile`'s singleton shape. The ledger math (`computeDayLedger`) lives in `src/lib` alongside `derive-targets.ts`, dependency-free so the Node smoke script can assert it directly. The UI reuses `MacroProgress` for the net-vs-target bar and mirrors `meal-detail.tsx`'s edit/delete conventions (no-confirm delete, `anyPending` guard) for the session detail screen.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Training-sessions data layer | Migration + types + repo + hooks | Schema/RLS mismatches surface late if not manually verified against the real project |
| 2. Day-ledger math + smoke coverage | Pure `computeDayLedger()`/`sumTrainingBurn()` + `smoke:training` | Net-negative days must not be silently clamped |
| 3. Log and manage a training session | Composer, detail screen, Training list on Today | UI touches `index.tsx` alongside Phase 4's later edit |
| 4. Day ledger display | `DayLedger` component wired into Today's header | Must degrade gracefully with no profile/target, not hide the ledger |

**Prerequisites:** S-02 (profile/targets) and S-06 (structured day view) — both already shipped.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes `logged_at` for a new session defaults to the submission instant (no manual time picker), matching the rest of the app's "log now" convention — not explicitly required by any FR, but consistent with existing UX.
- The Training list on Today is a plain (non-virtualized) block, not a second `SectionList` section — acceptable at single-owner scale (0–2 sessions/day) but would need revisiting if session volume ever grew materially.

## Success Criteria (Summary)

- The owner can log, edit, and delete a training session end-to-end from Today.
- The day ledger shows in/out/net and updates immediately on any session change.
- The ledger never blocks on profile setup, and never silently clamps a negative net.
