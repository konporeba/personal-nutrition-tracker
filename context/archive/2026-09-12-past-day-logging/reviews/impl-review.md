<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Past-Day Logging

- **Plan**: `context/changes/past-day-logging/plan.md`
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-09-12
- **Verdict**: REJECTED at review; all 10 findings since triaged and fixed (2026-09-12)
- **Findings**: 1 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated criteria all pass: `tsc --noEmit`, `npm run lint`, `npm run smoke`, and `smoke:past-day`, `meal-detail`, `training`, `log`, `saved-meals`, `day-view`, `analytics`.

## Findings

### F1 — Analytics day screen parses its route param with raw `new Date()`

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/analytics/day.tsx:32 (with src/app/analytics/index.tsx:122)
- **Detail**: `const parsedDate = date ? new Date(date) : null;` — the exact construction this change introduced `parseLocalDayKey` to forbid. `review.tsx:107` and `library.tsx:59` both use the parser; this screen does not, and Phase 3 turned it into a **write** surface (`:41 onAddToSection={(section) => addMeal.open(section, parsedDate)}`). Three consequences:
  1. **Crash.** `new Date('garbage')` is an `Invalid Date`, which is truthy — verified. So `MissingDay` is unreachable for a malformed param and `:36 dayFormat.format(parsedDate)` throws `RangeError: Invalid time value`. It also reaches `listMealEntriesForDay`, where `new Date(NaN,NaN,NaN).toISOString()` throws inside the queryFn.
  2. **Wrong day across DST.** `analytics/index.tsx:122` pushes `point.x.toISOString()` — an instant, not a day key. Local midnight Oct 25 at UTC+2 serializes as `2026-10-24T22:00:00Z`; re-parsed after the offset drops to UTC+1 it is Oct 24 23:00 local — the previous day — and the add tiles compose into it. `use-capture-flow.ts:145-147` states this rule explicitly; this caller violates it.
  3. **No future clamp.** `parseLocalDayKey`'s "a day is never in the future" invariant is bypassed. A hand-edited future `?date=` renders a composable day; `review.tsx` re-clamps downstream, so the popup says "To lunch, Jan 1" while the entry silently lands in today — the precise failure `add-meal-sheet.tsx:221-223` says this feature must avoid.
- **Fix**: Change `analytics/index.tsx:122` to `params: { date: localDayKey(point.x) }` and `analytics/day.tsx:32` to `const parsedDate = parseLocalDayKey(date);`.
  - Strength: Fixes all three at once and makes the trust boundary uniform across the three screens that accept a day.
  - Tradeoff: Touches a second file the plan never listed; any existing deep link with an ISO `date=` stops resolving (it would clamp/reject rather than silently land wrong).
  - Confidence: HIGH — `review.tsx` and `library.tsx` already do exactly this; the helper exists and is tested.
  - Blind spot: Haven't checked whether any bookmark or external link points at `/analytics/day?date=<iso>`.
- **Decision**: FIXED — parseLocalDayKey in analytics/day.tsx; analytics/index.tsx now pushes localDayKey(point.x)

### F2 — `LogToDaySheet` keeps its picked day across opens

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(today)/library.tsx:221-227
- **Detail**: The sheet is mounted unconditionally with `visible={loggingDayFor !== null}`, so its `useState` initializers run once per *LibraryScreen* mount, not per open. This is the identical hazard Phase 4 fixed in `training/index.tsx` and that `add-meal-provider.tsx` documents — and it was missed on the one sheet whose entire purpose is picking a day. The internal `close()` resets state, but the success path bypasses it (`library.tsx:141-144` calls `setLoggingDayFor(null)` and relies on `router.back()` to unmount). When `router.canGoBack()` is false — direct navigation or a web reload — the screen stays mounted and the next open is pre-set to the previously picked past day, one tap from writing there. Same staleness across midnight: `day` holds the mount-time "today" while `today` re-derives.
- **Fix**: Mount conditionally — `{loggingDayFor ? <LogToDaySheet visible … /> : null}` — matching `add-meal-provider.tsx:50-57` and `training/index.tsx:105-111`. The internal `close()` reset then becomes redundant.
- **Decision**: FIXED — LogToDaySheet mounted only while open; its manual reset removed as redundant

### F3 — Training sheet has no `isSuccess` double-submit guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/training-session-sheet.tsx:109,118-119
- **Detail**: `anyPending = create.isPending || update.isPending || remove.isPending` — no `create.isSuccess`. Both other commit sites in this change carry that guard and explain why in near-identical words (`review.tsx:176-177`, `library.tsx:74-78`): `isPending` flips false inside `onSuccess`, and the unmount only happens on a later render, leaving a frame where a second tap commits a duplicate. The training sheet is the one new write path and did not get it — and a duplicate on a *past* day is less likely to be noticed than on Today.
- **Fix**: Fold `create.isSuccess` into `anyPending`.
- **Decision**: FIXED — create.isSuccess folded into anyPending

### F4 — Today passes a captured instant where the provider expects a sentinel

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(today)/index.tsx:85,129,144
- **Detail**: `viewedDay = pastDay ?? day` resolves to a concrete `new Date()` when viewing today, and `AddMealProvider` stores it in state (`add-meal-provider.tsx:38-40`). That contradicts this file's own comment at `:56-57` ("`null` means today, rather than a captured date … storing 'today' here would pin it to yesterday") and defeats the `undefined` sentinel `add-meal-provider.tsx:19-21` documents as the clock-following value. A popup opened at 23:58 and confirmed at 00:01 backdates to yesterday at the section's mid-window time instead of logging now. This is the failure `context/foundation/lessons.md` records, one layer out — the instant is captured in provider `useState` rather than in a `useMemo(…, [])`.
- **Fix**: Pass the sentinel, not the resolved value: `addMeal.open(section, pastDay ?? undefined)` at all three call sites. `pastDay` is already exactly "a day deliberately chosen, or nothing."
- **Decision**: FIXED — all three call sites pass `pastDay ?? undefined`

### F5 — Five plan contracts describe a control that was never built

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: context/changes/past-day-logging/plan.md (Phase 2.3, 2.4, Phase 4.1, Phase 5.3, 5.4)
- **Detail**: The plan specifies "a `DayStepper` … placed above the existing section picker" (2.3), the same for the training edit branch (2.4), and "a `DayStepper` defaulting to today … placed above the type picker" (4.1). What shipped is `DayPill` — a bordered chip on the sheet's *subtitle* line that grows arrows inside itself when tapped, invented mid-implementation at the user's request and never reflected back into the plan. Two knock-ons:
  - Contract 5.3 says the training subtitle must read `'Add to today'` when the target is today; that literal no longer exists anywhere in `src/`. Contract 5.4 says the meal sheet should "include the date **when the entry's day is not today**"; the pill renders unconditionally.
  - Success criterion **5.8** — "Nothing in the wording changes when the target is today — no new noise on the common path" — is ticked at `plan.md:559` but no longer holds for either detail sheet. It does still hold for the compose path (5.1, 5.2).
  The capability shipped and the deviation is documented in `day-stepper.tsx:15-22`, but the plan is now an unreliable record of what exists.
- **Fix A ⭐ Recommended**: Add an addendum section to `plan.md` recording the `DayPill` design and restating 5.3/5.4/5.8 to match what shipped.
  - Strength: Preserves the work, and makes the plan safe for `/10x-archive` to keep as the historical record.
  - Tradeoff: Edits a plan after the fact; the original contracts stop being visible as originally written unless the addendum quotes them.
  - Confidence: HIGH — the design change was explicit and user-directed; only the record is out of date.
  - Blind spot: None significant.
- **Fix B**: Leave the plan as the record of intent and rely on commit messages for what shipped.
  - Strength: The plan stays an honest snapshot of what was agreed before implementation.
  - Tradeoff: Anyone reading the archived folder later sees contracts that don't match the code, including a ticked criterion that is false.
  - Confidence: MEDIUM — depends how the archive is used later.
  - Blind spot: Haven't checked whether `/10x-archive` validates contracts against code.
- **Decision**: FIXED via Fix A — plan.md now carries an "Addendum — what actually shipped" section

### F6 — `verification.md` was never created

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/past-day-logging/ (absent)
- **Detail**: `plan.md:453` says "Record the results in `context/changes/past-day-logging/verification.md`, matching the convention in `context/changes/bootstrap-verification/verification.md`." The folder contains only `change.md`, `plan.md`, `plan-brief.md`. The 18 manual checks were confirmed verbally and ticked in `## Progress`, but the artifact the plan called for does not exist.
- **Fix**: Write `verification.md` recording the manual pass — the 11 numbered steps from the plan's Testing Strategy, plus the automated results.
- **Decision**: FIXED — verification.md written, matching the archived-change convention

### F7 — `Sheet.subtitle` widened to `ReactNode`, unplanned

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/ui/sheet.tsx:52,99-105
- **Detail**: A shared primitive used by every popup in the app was modified to accommodate `DayPill`. The file appears nowhere in the plan — not in Changes Required, not in Current State Analysis. The change is benign and backward-compatible for the four other callers, but it is real scope creep into a component with app-wide blast radius. One latent behavior change: `subtitle ? … : null` became `typeof subtitle === 'string' ? … : (subtitle ?? null)`, so `subtitle=""` used to render nothing and now renders an empty `ThemedText` contributing the head's `gap: 1`. No current caller passes `''`.
- **Fix**: Keep the widening (it's the right shape) and record it in the plan addendum from F5; tighten the guard to `typeof subtitle === 'string' && subtitle` to preserve the old empty-string semantics.
- **Decision**: FIXED — widening kept and recorded in the addendum; guard tightened to `typeof subtitle === 'string' && subtitle`

### F8 — `local-day.ts` claims to be "the one place" but four duplicates survive

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/local-day.ts:1-9, and src/components/ui/date-strip.tsx:184-197, src/lib/streak.ts:12,18, src/data/use-analytics.ts:20, src/app/analytics/index.tsx:179
- **Detail**: The module header claims to be "the one place 'which day is this instant in' is answered." Verified duplicates remain: `date-strip.tsx` has private `startOfDay`/`addDays` and an **exported** `isSameDay`; `streak.ts` has a second private `localDayKey` plus `addDays` — in the same directory as the module claiming ownership; `use-analytics.ts` and `analytics/index.tsx` each have their own `addDays`. Worse, `(today)/index.tsx:26,110` imports `isSameDay` **from a presentational UI component** to make the data decision `setPastDay(isSameDay(date, day) ? null : date)`. Also a layering inversion the move was meant to fix: `src/lib/group-by-local-day.ts:5` imports `localDayKey` from `@/data/query-keys` — `lib/` reaching up into `data/` for a symbol that now lives in `lib/`.
- **Fix**: Delete the duplicates in favour of `@/lib/local-day`, and repoint the `lib/` importers at the real home. The `query-keys.ts` re-export is a reasonable shim for `data/` and component callers, but `lib/` files going through it undercuts the stated reason for the move.
- **Decision**: FIXED — four duplicate helper sets deleted; group-by-local-day.ts repointed at lib/; local-day.ts header now accurate

### F9 — The smoke script's DST assertion cannot fail

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/past-day-smoke.ts:105-106
- **Detail**: `assert(localDayKey(addLocalDays(new Date(2026, 9, 26), -1)) === '2026-10-25')` — `addLocalDays` is midnight-anchored, so this yields `2026-10-25` in every timezone, DST or not. It cannot fail, and it does not exercise the naive time-preserving shift the comment says it exists to catch. The runner's `TZ` is not pinned either, so even a meaningful version would pass or fail by accident of the machine. The other structural checks in `checkDaySeam()` are genuinely tz-independent and good.
- **Fix**: Pin `process.env.TZ` at the top of `checkDaySeam`, and assert the behavior that would actually regress — that a time-preserving shift gives the wrong day where `addLocalDays` gives the right one. Consider adding a `moveToDay` midnight-gap case in a tz whose DST transition is at midnight (`America/Santiago`), where a preserved `00:05` does not exist on the transition date and V8 resolves the gap using the pre-transition offset.
- **Decision**: FIXED — TZ pinned and scoped; assertion rewritten against epoch arithmetic, the form that actually breaks; self-checks that the fixture still bites

### F10 — Stale and duplicated comments

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/training-session-sheet.tsx:93-98 and :186-192; src/components/ui/day-stepper.tsx:1-3
- **Detail**: Three leftovers from phase-by-phase editing. (a) `training-session-sheet.tsx:93-98` stacks two contradictory comment blocks on one declaration — the first says "`null` here means 'this sheet has no day to offer yet'", the second says "Never null now"; the state is `Date`, never `null`. (b) `:186-192` doubles the same way on the `subtitle` prop, an edit-only description followed by the superseding both-branches one. (c) `day-stepper.tsx:1-3` says the extraction happened because past-day work "gave it several callers" — `DayStepper` still has exactly one caller (`log-to-day-sheet.tsx:61`); it is `DayPill` that has two.
- **Fix**: Delete the two superseded comment blocks; reword the `day-stepper.tsx` header so it doesn't assert reuse that doesn't exist.
- **Decision**: FIXED — two superseded comment blocks deleted; day-stepper.tsx header no longer claims reuse it does not have

## Also noted (not findings)

- **`ensureDailyTarget` on a backdated create writes today's target** as that past day's permanent snapshot. This is working as designed — it was an explicit planning decision ("Accept, document, verify"), is recorded in the plan's Migration Notes, and matches what `useAnalyticsRange`'s lazy backfill already does. Worth knowing: neither *update* hook calls `ensureDailyTarget`, so moving the only record into a previously empty day leaves it with no snapshot. Inside the 7/30-day analytics window the backfill covers it; outside, the day falls back to current targets. An asymmetry the create/update pair did not have before `logged_at` became patchable.
- **`moveToDay` and DST midnight gaps.** In timezones whose DST transition is at midnight (`America/Santiago`, `America/Havana`, `Australia/Lord_Howe`), a preserved `00:xx` may not exist on the transition date, and the record can land on the previous local day. Not reachable in `Europe/Warsaw` (transitions at 02:00/03:00). `timeForSection`'s five fixed times are all safely outside typical gaps, so only the move path and the training create path are theoretically exposed.
- **`DayStepper` lost a functional state updater** in the Phase 1 extraction: `log-to-day-sheet.tsx` previously did `setDay((p) => addDays(p, -1))`; the component now calls `onChange(addLocalDays(day, -1))` off a prop. Two taps batched into one React 18 update would advance one step instead of two. Low practical risk — separate taps are separate ticks.
- **Cache invalidation traced clean.** Every key in `query-keys.ts` was checked against every reader. `analytics.range(...)` rides the `analytics.all()` prefix; `trainingSessions.day(...)` is nested under `.all()`, so the broad invalidate genuinely covers a cross-day session move; the added `streak()` invalidations close the real gap; `useUpdateMealEntry`'s two-day pairing is correct and uses the caller-supplied source day. `mealEntries.all()` has no reader. No missing invalidation found.
- **Project rules honoured.** No `supabase` import from UI anywhere in the change; `deleted_at IS NULL` filters untouched; all new writes go through the repo seam; `@/` aliases throughout; no platform-split file needed. `lessons.md`'s rule is well applied in five places — F4 is the single regression.
- **"What We're NOT Doing" fully respected.** All seven boundaries verified clear: no editable time field, no future-day logging, no training deep-link, no backwards bound, no `daily_targets` reconstruction, `LogToDaySheet` retained, no schema or migration work (`supabase/` untouched).
