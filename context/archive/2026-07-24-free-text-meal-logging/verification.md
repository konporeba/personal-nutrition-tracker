# Verification — Free-Text Meal Logging (S-01)

The roadmap's north star: the owner types a meal, reviews the AI estimate, and
commits it to today. Three layers of proof — an automated smoke script that drives
the real seams against the deployed backend, the manual checks from Phases 1–3,
and the device run that also closes F-02's carried-forward gap.

## Automated — log smoke

**Command:** `npm run smoke:log`
(bundles `scripts/log-smoke.ts` via `scripts/run-log-smoke.mjs` and runs it under
Node with `--env-file=.env --env-file-if-exists=.env.local`.)

The runner reuses the esbuild `nodeShim` from `scripts/run-estimate-smoke.mjs`
verbatim — remapping `@/lib/supabase` and `@/lib/new-id` to their web variants and
no-oping the RN URL polyfill — so `src/data/*` loads under plain Node.

The script signs in as the owner and drives the same seams the review screen
drives, against the **deployed** backend:

1. `sectionForTime` across all 11 boundary cases, including the exact transition
   minutes (10:29/10:30, 11:59/12:00, 14:59/15:00, 17:59/18:00) — checked first,
   before spending an AI call
2. a real meal text → `ok: true`, `recognized: true`, positive calories, ≥1
   assumption (FR-082)
3. commit → asserts the row is owner-scoped and carries `source = free_text`, the
   inferred `section`, and the `estimation_run_id`
4. day read → the entry is returned by `listMealEntriesForDay`, with the same
   calories, and the day total moved by exactly that entry's calories
5. gibberish → `recognized: false` with **null** macros (nothing fabricated,
   FR-008), then commits as `source = manual` with the caller's own numbers —
   while still linking its run, so the audit trail survives the manual path
6. cleared macro fields → stored as `null`, never `0`
7. soft delete → the entry drops out of the day read and off the total
8. cleanup — hard-deletes every entry and run it created (entries first: the FK is
   `ON DELETE SET NULL`, so removing runs first would silently defeat the
   `estimation_run_id` assertions on a re-run)

Exits non-zero on any failed assertion.

### Recorded run — 2026-07-24

```
✓ sectionForTime: 11 boundary cases, all correct
✓ signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ estimated "Three Slices of Pepperoni Pizza": 855 kcal, 2 assumption(s)
✓ committed a12f5661-c14b-4aca-8a7e-ff7cc9c43234 as free_text/supper, run 8aa49a1d-8a1a-43d5-a84e-f116c1535c09 linked
✓ day read: entry present, total 0 -> 855 kcal
✓ unrecognized input: null macros from the model, committed 0995ccd1-5147-4ef0-9417-043a3ccd0112 as manual with the owner's own values, run 97a589d6-3374-46d2-b47c-840b83cc765a linked
✓ cleared macro fields stored as null, not 0
✓ soft delete: entry dropped from the day read, total 1165 -> 1065 kcal

LOG SMOKE PASSED ✅
(cleanup) hard-deleted 3 entry(ies) and 2 run(s)
```

Exit code 0. Proves the north star's core claim end to end: one typed sentence
becomes a reviewed, committed entry in today's log, and an unrecognized input
never produces a number the owner did not type.

## Automated — static and prior smokes

| Check | Command | Result |
|---|---|---|
| Type checking | `npx tsc --noEmit` | clean (every phase) |
| Linting | `npm run lint` | clean (every phase) |
| Web bundle | `npx expo export --platform web` | bundles; routes `/` and `/review` |
| F-01 store smoke | `npm run smoke` | PASSED, exit 0 |
| F-02 estimate smoke | `npm run smoke:estimate` | PASSED, exit 0 |

No regression in either shipped slice.

## Manual — Today surface (Phase 1)

| # | Check | Result |
|---|-------|--------|
| 1.5 | App opens directly onto Today; no Explore tab on native or web | pass |
| 1.6 | Entries created by `npm run smoke` appear with a correct running total | pass |
| 1.7 | Light and dark mode both render legibly | pass |

## Manual — capture & estimate (Phase 2)

| # | Check | Result |
|---|-------|--------|
| 2.4 | A real meal reaches the review screen with macros and ≥1 assumption | pass |
| 2.5 | Spinner shows during the call; the input is disabled for its duration | pass |
| 2.6 | Network disabled → error shown, **typed text preserved**, Retry issues one new call | pass |
| 2.7 | Gibberish reaches the review screen with no fabricated numbers | pass |
| 2.8 | Direct navigation to `/review` without a valid `runId` degrades gracefully | pass |

## Manual — commit & delete (Phase 3)

| # | Check | Result |
|---|-------|--------|
| 3.4 | A typed meal commits and appears in the day list, total updated, no manual refresh | pass |
| 3.5 | Editing a macro before saving persists the edited value, not the estimated one | pass |
| 3.6 | Clearing a macro field stores `null`, not `0` | pass |
| 3.7 | Gibberish commits as a manual entry with the typed values, `source = 'manual'` | pass |
| 3.8 | A mid-morning entry lands in the expected section (checked in the DB) | pass |
| 3.9 | Long-press deletes an entry; row and total drop together | pass |
| 3.10 | The deleted row stays gone after a reload (soft delete persisted, not cache) | pass |

## Manual — device run and cross-client parity (Phase 4)

| # | Check | Result |
|---|-------|--------|
| 4.5 | Full loop on a real device/simulator (`npx expo start` → `i`/`a`) | pass |
| 4.6 | Cross-client parity: a meal logged on one client appears on the other after a focus refetch (US-07) | pass |
| 4.7 | `verification.md` records a real run with its output | pass (above) |

**This closes F-02's carried-forward gap.** The Phase 4 device run is the first
native-context invocation of `estimateMeal` against the deployed function — the
one open item the estimation-proxy slice shipped with. Recorded against that
slice's `verification.md` (Known gaps) and its plan step 3.4:
`context/archive/2026-07-22-ai-estimation-proxy/`.

## Deviations from the plan

- **The composer pushes `{ runId, text }`, not `?runId=…` alone.** The plan's
  handoff design is otherwise followed exactly — the estimate travels through the
  query cache under `queryKeys.estimate(runId)`, never the URL. The extra `text`
  param exists because the composer clears on success, so Phase 3's "the typed
  text seeds the name" for `recognized: false` would have no source; and
  `estimate.name` is not a usable substitute, since the Edge Function's `sanitize`
  passes the model's `name` through unchanged on the unrecognized path (including
  `''`). Two consequences worth knowing: on web the meal description appears in the
  address bar, and a long description makes a long URL.
- **`use-meal-entries.ts` is listed under Phase 3's changes but needed no edit** —
  `useDeleteMealEntry` was already written in Phase 1, per that phase's own
  contract. Not drift; the plan front-loaded it.

## Known gaps

- **No component-level tests.** There is still no test runner (per the plan, this
  slice deliberately did not add Jest). UI regressions are caught only by the
  manual checks above; the smoke script covers the data path, not the rendering.
- **Section boundaries are provisional (OQ-10).** `sectionForTime` follows the
  PRD's worked example. Wrong guesses stay invisible until S-06 ships and only
  affect entries logged before then — the function is the seam S-06 extends with
  a user override.
- **Save is gated on a non-empty name only**, not on a calorie value. Gating on
  calories would make "clear a macro field and save" impossible (criterion 3.6).
  An entry with a name and all-null macros is an honest unknown, not a fabricated
  value, so FR-008 still holds.
- **`quota` remains unreachable** (inherited from F-02): a provider-side 429 is
  swallowed by the function's own `502 estimation_failed` and classifies as
  `server`. The composer's `quota` message therefore never fires today.
- **Estimates staged in the query cache are not garbage-collected eagerly.** A
  `setQueryData` entry under `queryKeys.estimate(runId)` lives for the shared
  24-hour `gcTime` and is persisted to AsyncStorage. Harmless at this scale, but
  worth a targeted `removeQueries` if the review flow ever loops.
- **`.expo/types/router.d.ts` only regenerates under `expo start`**, not
  `expo export`. A stale copy makes `tsc` reject a newly added route's pathname;
  run the dev server once after adding routes.
