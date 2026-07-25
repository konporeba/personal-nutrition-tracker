# Verification — Food Icon System (S-05)

Every logged entry carries a food icon so the day is parseable at a glance (US-13,
FR-050/051/052, FR-061), at zero per-entry runtime cost. Two layers of proof — an
automated smoke driving the pure mapping and the real store, and the manual checks
from Phases 1–3.

## Automated — icon smoke

**Command:** `npm run smoke:icon`
(bundles `scripts/icon-smoke.ts` via `scripts/run-icon-smoke.mjs` and runs it under
Node with `--env-file=.env --env-file-if-exists=.env.local`.)

The runner reuses the esbuild `nodeShim` from `scripts/run-estimate-smoke.mjs`
verbatim — remapping `@/lib/supabase` and `@/lib/new-id` to their web variants and
no-oping the RN URL polyfill — so `src/data/*` loads under plain Node.

The script asserts, against the **deployed** backend:

1. `emojiForFood` across 14 representative cases — recognized categories, the
   specificity-ordering pins ("grilled chicken" vs "chicken", "ice cream" vs bare
   "cream"), and the generic fallback for gibberish/empty — checked first, no network
2. `iconForEntry` precedence: a stored `food_category` wins, a `name` is the
   fallback, generic is last
3. a committed entry carries its `food_category`, and `iconForEntry` on the row read
   back via `listMealEntriesForDay` resolves to the expected specific emoji (🍕)
4. a null-category entry stays null on read and falls back to a name-derived icon (🥚)
5. cleanup — hard-deletes every test entry it created

Exits non-zero on any failed assertion.

### Recorded run — 2026-07-25

```
✓ mapping: 14 emojiForFood cases + iconForEntry precedence, all correct
✓ signed in as owner c46272e0-d17d-436e-9f74-28207dc993fc
✓ food_category round-trips; iconForEntry(row) === 🍕
✓ null-category entry falls back to a name-derived icon (🥚)

ICON SMOKE PASSED ✅
(cleanup) hard-deleted 2 test entry(ies)
```

Exit code 0. Proves the mapping is correct and stable and that `food_category`
persists and drives the same icon the Today row renders.

## Automated — static and prior smokes

| Check | Command | Result |
|---|---|---|
| Type checking | `npx tsc --noEmit` | clean (every phase) |
| Linting | `npm run lint` | clean (every phase) |
| Web bundle | `npx expo export --platform web` | bundles (phases 2–3) |
| F-01 store smoke | `npm run smoke` | PASSED, exit 0 |
| S-02 profile smoke | `npm run smoke:profile` | PASSED, exit 0 |
| S-01 log smoke | `npm run smoke:log` | PASSED, exit 0 |
| F-02 estimate smoke | `npm run smoke:estimate` | PASSED, exit 0 |

No regression in any shipped slice.

## Manual — data layer (Phase 1)

| # | Check | Result |
|---|-------|--------|
| 1.4 | The `meal_entries` table shows the new nullable `food_category` column with RLS still enabled | pass |

## Manual — emoji mapping core (Phase 2)

| # | Check | Result |
|---|-------|--------|
| 2.4 | Spot-check a handful of labels/names by hand → the function agrees | pass |

## Manual — wire commit + render (Phase 3)

| # | Check | Result |
|---|-------|--------|
| 3.4 | Logging a recognized meal shows a matching emoji on its Today row | pass |
| 3.5 | A manual/unrecognized entry shows a name-derived emoji, or the generic one when nothing matches | pass |
| 3.6 | Entries logged before this slice (null category) still show an icon via name-derivation | pass |
| 3.7 | The row layout stays legible in light and dark; long names still wrap without pushing the icon or calories off-row | pass |

## Deviations from the plan

- None. The four phases were implemented as planned. The `iconForEntry` seam is
  shared verbatim by `MealEntryRow` and the smoke, so what the smoke asserts is what
  the day view renders.

## Known gaps

- **Emoji style is platform-variant** — the FR-051 "single style / weight / palette"
  wording is an accepted compromise for the zero-asset/zero-dependency benefit.
  Emoji are multicolor and render slightly differently on iOS/Android/web, and are
  not tintable to the theme. Revisitable by swapping to a vector icon font later —
  the mapping stores `food_category`, so only `food-emoji.ts` would change, no
  migration.
- **Open-vocabulary matching leans on table ordering.** The specificity-sensitive
  cases are pinned by the smoke; a novel label the table doesn't cover falls back to
  a name-derived or generic icon (honest, never wrong-but-confident).
- **FR-053 (icon override), FR-054 (per-component icons), FR-055 (saved-meal
  icons)** are deferred — they depend on slices not yet built (entry edit, component
  decomposition, saved meals). `food_category` is on `MealEntryPatch` so a later edit
  slice can set it without a repo change.
- **No backfill.** Rows logged before this slice keep `food_category = null` and
  render a name-derived or generic icon at read time.
- **No component-level tests** (no test runner, per the established pattern); the
  smoke covers the mapping + data path, not rendering.
