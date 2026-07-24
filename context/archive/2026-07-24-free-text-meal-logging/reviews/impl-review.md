<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Free-Text Meal Logging (S-01)

- **Plan**: `context/changes/free-text-meal-logging/plan.md`
- **Scope**: All 4 phases (full plan)
- **Date**: 2026-07-24
- **Verdict**: NEEDS ATTENTION at review time → **all 6 findings FIXED in triage**
- **Findings**: 0 critical, 2 warnings, 4 observations — 6 fixed, 0 skipped

## Post-triage re-verification (2026-07-24)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npx expo export --platform web` | PASS — bundle 2.5 MB → **1.5 MB** |
| `npm run smoke:log` | PASS, exit 0 |

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria re-verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npx expo export --platform web` | PASS — routes `/`, `/review` |
| `npm run smoke:log` | PASS, exit 0 |
| `npm run smoke`, `npm run smoke:estimate` | PASS, exit 0 (run during Phase 4) |

Manual rows: all 15 marked `[x]` on owner confirmation across the four phase gates.
Rows 3.6, 3.7, 3.8 and 3.10 additionally have machine evidence in `smoke:log`
(null-not-zero, `source = manual` with linked run, section assertions, soft-delete
drop-out), so they are not rubber-stamped. Rows 1.5–1.7, 2.4–2.8, 3.4, 3.5, 3.9,
4.5, 4.6 rest on owner confirmation alone — expected, since no component-level test
runner exists (a documented plan decision).

## Findings

### F1 — Today's date is captured once at mount and never rolls over

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/app/(today)/index.tsx:25`
- **Detail**: `const today = useMemo(() => new Date(), []);` has an empty dependency
  array, so the instant is frozen at mount. Mobile apps are resumed rather than
  relaunched, so a session that spans midnight keeps observing the previous day's
  query key. The consequence compounds past a stale header: `useCreateMealEntry`
  invalidates the key derived from the new entry's `logged_at` (the *new* day),
  while the screen still observes the *old* day's key — so a meal logged after
  midnight does not appear in the list at all, and fetch-on-focus refetches the
  stale key rather than correcting it. The plan's day-bucketing design is sound;
  this is purely the lifetime of the captured instant.
- **Fix A ⭐ Recommended**: Re-derive the day inside `useDayEntries` from a value
  that changes when the calendar day does — e.g. key the query on `localDayKey(new
  Date())` computed per render, and drop the memo in the screen.
  - Strength: Fixes it at the seam every future slice inherits (S-02, S-06, S-11
    all read days), not at one call site. `localDayKey` already exists for exactly
    this normalization.
  - Tradeoff: A per-render `new Date()` in the hook; harmless, since the key
    normalizes to a stable string.
  - Confidence: HIGH — the key factory already collapses instants to a local
    `YYYY-MM-DD`, so this is a lifetime change, not a design change.
  - Blind spot: The screen would still not *re-render* at the stroke of midnight
    on its own; it corrects on the next render or focus. Closing that fully needs
    a timer or an app-state listener.
- **Fix B**: Recompute `today` on app foreground by subscribing to `AppState` in
  the screen.
  - Strength: Corrects on resume, which is when a user actually returns.
  - Tradeoff: Puts date lifetime logic in the screen rather than the data seam;
    every future day-reading screen must repeat it. Also web has no `AppState`
    foreground event in the same form, so it needs a platform split.
  - Confidence: MEDIUM — `setupQueryRuntime` already does native foreground
    handling, so there is a precedent, but it is a second mechanism for one
    concern.
  - Blind spot: Not verified how `expo-router` remounts tab screens on resume;
    if it remounts, the current code may be less exposed than it looks.
- **Decision**: FIXED via Fix A — `useDayEntries` now resolves the day itself and
  returns `{ query, day }`; the screen's `useMemo` is gone, so both the query key
  and the header label re-derive per render.

### F2 — A failed delete fails silently

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/app/(today)/index.tsx:48`
- **Detail**: `onLongPress={() => deleteEntry.mutate(item)}` passes no `onError`,
  and `useDeleteMealEntry` invalidates only on success. If the soft delete fails
  (offline, RLS, transient 5xx) the row simply stays put with no message. The user
  reads that as "the long-press didn't register", long-presses again, and each
  attempt is another silent failure. Every other user-facing failure path in this
  slice reports itself (the composer's error line, the review screen's "Couldn't
  save that"), so this is an inconsistency as much as a gap.
- **Fix**: Surface the error the way the review screen does — render a short
  message when `deleteEntry.isError`, near the list.
- **Decision**: FIXED — an error line now renders under `DayTotal` in the list
  header when `deleteEntry.isError`.

### F3 — Commit is not guarded between mutation success and navigation

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/app/(today)/review.tsx:63`
- **Detail**: `canSave` gates on `!create.isPending`, which covers the in-flight
  window. It does not gate on `create.isSuccess`. After `onSuccess` fires,
  `isPending` is false and `router.back()` has not yet unmounted the screen — a
  one-frame window in which a second tap would commit a duplicate entry. Narrow,
  and it needs a fast double-tap to hit, but a duplicated meal is a real data
  outcome rather than a cosmetic one.
- **Fix**: Include `&& !create.isSuccess` in the `canSave` predicate.
- **Decision**: FIXED — `canSave` now also gates on `!create.isSuccess`.

### F4 — `text` route param is a documented deviation from the plan's handoff

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/components/meal-composer.tsx:34`
- **Detail**: The plan specifies pushing `/review?runId=…`; the implementation
  pushes `{ runId, text }`. The reason is sound and was disclosed at the Phase 2
  gate: the composer clears on success, so Phase 3's "the typed text seeds the
  name" for `recognized: false` would otherwise have no source, and `estimate.name`
  is unreliable for unrecognized input (the Edge Function's `sanitize` passes
  through whatever the model returned, including `''`). The estimate itself still
  travels via the cache exactly as designed. Two consequences worth naming: on web
  the meal text appears in the address bar, and a long description makes a long URL.
- **Fix**: Record the deviation in `verification.md` so the plan and the code stop
  disagreeing for future readers.
- **Decision**: FIXED — `verification.md` gained a "Deviations from the plan"
  section covering this and the Phase 3 `use-meal-entries.ts` no-op.

### F5 — Scaffold leftovers survive in the product UI and manifest

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/components/app-tabs.web.tsx:63`, `package.json:15`,
  `src/components/animated-icon.tsx:98`
- **Detail**: The plan's intent for the scaffold deletion was "the app becomes the
  product", and the brand text was duly changed to "Nutrition Tracker" — but the
  web tab bar still carries an "Expo documentation" external link labelled "Docs",
  which now reads as a stray in a personal nutrition tracker. Two dead artifacts
  also survive the deletion: `expo-device` is still a dependency though nothing in
  `src/` imports it (it was only used by the deleted starter home screen), and
  `AnimatedIcon` is exported from both `animated-icon.tsx` and
  `animated-icon.web.tsx` with no importers (only `AnimatedSplashOverlay` is used,
  which is why the plan correctly said to keep the module).
- **Fix**: Remove the Docs link and its `ExternalLink`/`SymbolView` imports if they
  become unused, drop `expo-device`, and delete the `AnimatedIcon` export from both
  variants.
- **Decision**: FIXED — removed the Docs link; deleted `AnimatedIcon` from both
  variants along with the keyframes and styles only it used (the web variant
  reduces to the no-op `AnimatedSplashOverlay`); deleted the modules and assets
  that fell out (`external-link.tsx`, `animated-icon.module.css`,
  `logo-glow.png`); dropped `expo-device`, plus `expo-symbols` and
  `expo-web-browser`, which this cleanup orphaned. **Side effect: the web bundle
  went from 2.5 MB to 1.5 MB.**

### F6 — `sumCalories` is duplicated between the component and the smoke script

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/day-total.tsx:11`, `scripts/log-smoke.ts:63`
- **Detail**: The total-summing rule ("skip nulls, never coerce to 0") exists twice.
  The duplication is defensible — `day-total.tsx` imports `react-native`, so the
  esbuild-bundled Node smoke cannot import it — but it means the smoke asserts
  against its own copy of the rule rather than the one the UI actually runs. If the
  UI's summing ever changes, the smoke keeps passing.
- **Fix**: Move `sumCalories` to a dependency-free module (e.g.
  `src/lib/sum-calories.ts`, alongside `section-for-time.ts`, which the smoke
  already imports successfully) and have both call sites use it.
- **Decision**: FIXED — extracted to `src/lib/sum-calories.ts`; `day-total.tsx`
  and `log-smoke.ts` both import it, so the smoke now asserts against the rule the
  UI runs.

## Notes on what passed

- **Architecture — the repo seam holds.** No screen or component imports
  `@/lib/supabase`; the only importers are `session.ts`, `estimation.ts`, and the
  two `*.repo.ts` files. The new `use-*.ts` hooks layer sits cleanly above the
  repos, and screens import only from there, exactly as CLAUDE.md requires.
- **The plan's flagged trap is closed correctly.** `useEstimateMeal` converts
  `estimateMeal`'s resolved `{ ok: false }` into a thrown `EstimateFailedError`,
  so `isError` is meaningful; `recognized: false` is correctly *not* folded into
  the error path.
- **The never-fabricate invariant is enforced structurally**, not by convention:
  `seedField` maps null to `''`, `toNumberOrNull` maps `''` and `'.'` to `null`,
  and `smoke:log` asserts null-not-zero against the live database.
- **Both platform-split tab files were changed together**, which the plan named as
  Phase 1's key risk.
- **`sectionForTime` is total and boundary-correct**, verified by 11 cases
  including every exact transition minute.
- **Phase 3 listed `use-meal-entries.ts` as a file to change but it needed no
  edit** — `useDeleteMealEntry` was already written in Phase 1 per that phase's own
  contract. Not drift; the plan front-loaded it.
