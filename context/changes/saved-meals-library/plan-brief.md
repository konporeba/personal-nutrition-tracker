# Saved Meals Library — Plan Brief

> Full plan: `context/changes/saved-meals-library/plan.md`

## What & Why

Build a saved-meals library (roadmap S-08): save any newly-committed meal, then re-log it to today in one tap with no AI call. Edits to a saved meal must never retroactively change entries already logged from it. This closes US-04 ("log a repeat meal instantly") and FR-010/011/012/055.

## Starting Point

The schema already anticipates this — `meal_entries.source` includes an unused `'saved_meal'` literal. The write path (`review.tsx`), icon system (`iconForEntry()`), and gesture conventions (long-press vs. tap-opens-sheet) all exist and are reused as-is. Nothing about saved meals is built yet: no table, no screen, no library.

## Desired End State

The owner checks "Save to library" while committing a meal, later opens a library screen from Today, taps a saved meal to log it to today instantly, and long-presses it for Edit / Delete / "Log to another day…". Editing a saved meal's calories after re-logging it never changes the entry already sitting on today's list.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Re-log scope | Build a minimal day+section picker ("any day") | FR-011 says "any day," not "today"; the fast tap path still defaults to today so the common case stays 1 tap. |
| Save entry point | Checkbox on `review.tsx` at commit time | All fields are already in scope there; avoids designing a new gesture on already-logged rows. |
| Row gestures | Tap = instant re-log to today; long-press = Edit/Delete/Log-to-another-day sheet | Tap alone satisfies FR-011's ≤2-tap bar; routing the rest through a sheet avoids inventing a 3rd gesture. |
| Icon storage | Store `food_category` text, reuse `iconForEntry()` | Zero new UI — the existing S-05 resolver already does exactly what FR-055 asks for. |
| Audit link | No FK from `meal_entries` back to `saved_meals` | Matches the schema-wide "no FK to mutable data" pattern; makes copy-on-log structurally guaranteed, not just a convention. |
| FR-013 (multiplier) | Deferred | Not in S-08's roadmap PRD refs; keeps the fast re-log path free of extra taps. |
| Duplicate names | Allowed freely | Matches how `meal_entries.name` is already unrestricted; no PRD requirement to dedupe. |

## Scope

**In scope:** save-to-library checkbox on commit, library screen, tap-to-relog (today), long-press sheet (Edit / Delete / Log to another day), a minimal day+section picker, edit screen, smoke coverage.

**Out of scope:** FR-013 multiplier/scaling, duplicate-name prevention, an audit FK, a general icon picker, saving from an already-logged entry (only from commit time).

## Architecture / Approach

New `saved_meals` table (same shape/RLS/trigger pattern as `meal_entries`, minus log-specific fields) + `saved-meals.repo.ts` + `use-saved-meals.ts`, mirroring the existing data-layer conventions exactly. Re-logging calls the *existing* `createMealEntry` with `source: 'saved_meal'` and values copied from the saved meal at tap time — no new write path for the log itself, just a new source of input data.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `saved_meals` table, RLS, repo, hooks | Insert-whitelist gotcha (a field added to the type but not the repo's row builder silently drops) |
| 2. Save to library | Checkbox on `review.tsx`, best-effort write | Must never block the meal commit on failure |
| 3. Library + fast re-log | Library screen, tap-to-relog to today | Must land the ≤2-tap requirement cleanly |
| 4. Manage saved meals | Long-press sheet: Edit / Delete / Log to another day | Day+section picker is genuinely new UI with no precedent |
| 5. Smoke coverage | `smoke:saved-meals` proving copy-on-log | Must prove the *negative* — an edit doesn't retroactively change history |

**Prerequisites:** S-01 (free-text logging), S-05 (food-icon system) — both already shipped.
**Estimated effort:** ~3-4 sessions across 5 phases.

## Open Risks & Assumptions

- The day+section picker (Phase 4) has no existing precedent in this app (Today is always "now"); it's scoped deliberately minimal (a stepper, not a calendar) to keep this contained.
- "Log to another day" takes more than 2 taps by design — FR-011's ≤2-interaction bar is met for the default/common today path, not the any-day path. This was an explicit tradeoff, not an oversight.

## Success Criteria (Summary)

- A meal can be saved at commit time and re-logged to today in exactly 2 taps (open library, tap the meal).
- Editing or deleting a saved meal never changes any entry already logged from it.
- A saved meal can also be logged to a different day and section via a short picker flow.
