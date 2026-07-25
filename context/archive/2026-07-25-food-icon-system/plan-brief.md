# Food Icon System (S-05) — Plan Brief

> Full plan: `context/changes/food-icon-system/plan.md`

## What & Why

Give every logged entry a food icon so the day is parseable at a glance (US-13,
FR-050/051/052, FR-061) — at zero per-entry runtime cost. The estimate model
already returns a coarse `food_category`; we persist it and map it to an **emoji**,
falling back to a name-derived or generic emoji when there's no category.

## Starting Point

The category is produced on every estimate (`estimation-types.ts:25`) but **dropped
at commit** — `review.tsx` doesn't pass it, `meal_entries` has no column for it, and
`MealEntryRow` renders only name + calories. No icon library is installed; the app
uses `expo-image` + custom PNGs.

## Desired End State

Each Today row leads with an emoji: a specific glyph for recognized meals (from
`food_category`), a best-effort glyph for manual/unrecognized/legacy entries (from
`name`), and a single generic food emoji when nothing matches — resolved by a
synchronous table lookup, no assets, no network.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Icon source | Emoji | Zero assets/deps, inherently bundled; FR-051 "single style" accepted as a soft compromise | Plan |
| Stored field | `food_category` (nullable text) | Store the identity, map to an icon at render — swap icon sets later without a backfill | Plan |
| Taxonomy breadth | Large (40+ categories) | Keep the generic fallback rare across everyday meals | Plan |
| No-category entries | Best-effort from name, then generic | Give manual/legacy rows a specific icon where possible | Plan |
| Match strategy | Normalized keyword/synonym, first-hit | Robust to open-vocabulary labels and messy names | Plan |
| Placement | Today rows only | Directly delivers US-13; smallest surface | Plan |
| FR-053/054/055 | Deferred | Override, per-component, and saved-meal icons depend on unbuilt slices | Plan |

## Scope

**In scope:** nullable `food_category` column; threading it through commit; a pure
`food-emoji.ts` mapping (40+ categories, synonym/substring match, generic fallback);
emoji on every Today row (recognized, manual, and legacy).

**Out of scope:** icon override (FR-053), per-component icons (FR-054), saved-meal
icons (FR-055), review-screen preview, vector/PNG icon sets, category backfill,
sectioned day view (S-06).

## Architecture / Approach

Follows the established slice shape: additive migration + type/repo threading (data),
a dependency-free `src/lib/food-emoji.ts` the smoke imports (core), then wiring the
one write path (`review.tsx`) and the one read path (`MealEntryRow`). `iconForEntry`
is the shared seam — the row and the smoke resolve icons through the same function.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `food_category` column + types + repo whitelist | Repo whitelists fields — must add the field or it's dropped |
| 2. Emoji core | `food-emoji.ts`: table + `emojiForFood` + `iconForEntry` | Match ordering (specific before generic) or wrong icons |
| 3. Wire + render | Category threaded on commit; emoji on Today rows | Row layout with long names in light/dark |
| 4. Verification | `smoke:icon` (mapping + round-trip) + doc | — |

**Prerequisites:** F-02 + S-01 (both shipped). **Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- **Emoji are multicolor and platform-variant** — FR-051's "single style/weight/
  palette" is a soft, accepted compromise for the zero-cost/zero-dep benefit.
- **Open-vocabulary matching** leans on table ordering; specificity-sensitive cases
  are pinned by the smoke.
- Legacy/manual rows rely on name-derivation, which can occasionally mislabel;
  generic fallback is the honest floor.

## Success Criteria (Summary)

- Recognized meals show a matching emoji on Today; manual/legacy entries show a
  name-derived or generic one.
- `food_category` round-trips through the store (`smoke:icon` exits 0).
- No regression in the shipped slices' smokes.
