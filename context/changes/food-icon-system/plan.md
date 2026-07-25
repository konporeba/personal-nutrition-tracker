# Food Icon System (S-05) Implementation Plan

## Overview

Give every logged entry a food icon so the day is visually parseable at a glance
(US-13, FR-050/051/052, FR-061) — at zero per-entry runtime cost. The model
already returns a coarse `food_category` on every estimate; this slice persists
that label, maps it to an **emoji** through a pure, dependency-free lookup (a 40+
category synonym table with a generic fallback), and renders the emoji on each
Today row. Entries without a category (manual, unrecognized, or logged before this
slice) get a best-effort emoji derived from their name, falling back to a generic
food glyph.

This is the roadmap's **S-05**, prerequisites F-02 + S-01 (both shipped). The
icon source is **emoji** (owner's decision): zero assets, zero dependencies,
inherently bundled. The FR-051 "single style / weight / palette" wording becomes a
soft, accepted compromise — emoji are multicolor and render slightly differently
per platform (see Open Risks).

## Current State Analysis

**The category exists but is thrown away at commit.** `Estimate.food_category`
(`src/data/estimation-types.ts:25`) is a short lowercase label the model produces
("eggs", "pasta", "salad", "beverage") — explicitly documented as "S-05 maps this
to an icon". But the S-01 commit path drops it:

- `src/app/(today)/review.tsx:84-99` builds the `create.mutate({…})` payload
  without `food_category`.
- `src/data/types.ts` — `MealEntry` / `NewMealEntry` have no `food_category` field.
- `supabase/migrations/20260720120000_core_log_schema.sql` — `meal_entries` has no
  such column.
- `src/data/meal-entries.repo.ts:23-35` — `createMealEntry` **whitelists** fields
  into `row` explicitly, so a new field does not pass through automatically; it must
  be added there. Reads use `select('*')` (`:52`), so they pick up a new column for free.

**The Today row renders name + calories only.** `src/components/meal-entry-row.tsx`
has no icon; its header comment already flags "the food icon (S-05) belongs to a
later slice."

### Key Discoveries:

- **No icon library is installed.** `package.json` has `expo-image`, `expo-font`,
  `@expo/ui`, and custom PNG assets under `assets/images/tabIcons/` — but no
  `@expo/vector-icons`. Emoji (chosen) need none of that: a `<ThemedText>` renders
  them as text.
- **Pure mapping belongs in `src/lib`** so the Node smoke can import it, per the
  `sum-calories.ts` / `section-for-time.ts` / `derive-targets.ts` precedent
  (these modules avoid importing `react-native`).
- **`food_category` is open-vocabulary.** The Edge Function prompt asks for "a
  short lowercase label for the primary food" but does not constrain it to a fixed
  set, so the mapping must normalize and match by keyword/synonym/substring, not by
  exact key (`supabase/functions/estimate/estimate.ts:28-29`).
- **Legacy and manual entries are handled by the same name-derivation path** — no
  backfill migration is needed. An entry with `food_category = null` (every row
  logged before this slice, plus every manual/unrecognized entry) resolves its icon
  from `name`, then the generic fallback.
- **`updateMealEntry` passes its patch straight through** (`meal-entries.repo.ts:62`),
  so adding `food_category` to `MealEntryPatch` is enough to make it editable later
  (FR-053) without repo changes — but no override UI ships here.

## Desired End State

Every row in the Today list shows a leading emoji: a specific food glyph for
recognized meals (mapped from `food_category`), a best-effort glyph for manual /
unrecognized / legacy entries (mapped from `name`), and a single generic food emoji
when nothing matches. Committing a recognized meal stores its `food_category`; the
icon costs nothing per entry (a synchronous table lookup at render). The mapping is
verified by a smoke exercising representative labels/names plus a `food_category`
round-trip through the store.

Verified by an extended/new smoke exiting 0 (mapping cases + DB round-trip) plus the
static checks and the manual Today check.

## What We're NOT Doing

- **FR-053 — user icon override.** No per-entry icon picker. `food_category` is
  added to `MealEntryPatch` so a later edit slice (S-07) can set it, but no override
  UI ships. (Deferred per questioning.)
- **FR-054 — per-component icons.** No multi-item decomposition exists yet
  (FR-083 unbuilt), so no component-level icons. (Deferred.)
- **FR-055 — saved-meal icons.** Saved meals aren't built. (Deferred.)
- **Review-screen icon preview.** The icon renders on Today rows only (FR-061); the
  review screen is unchanged. (Deferred per questioning.)
- **A vector icon font or custom PNG set.** Emoji only — no `@expo/vector-icons`,
  no authored assets.
- **Backfilling `food_category` on existing rows.** Legacy rows render a
  name-derived or generic emoji at read time; the column stays null for them.
- **Any change to the estimate loop, derivation, or profile.** S-01/S-02 seams are
  untouched beyond adding one field to the commit payload.
- **Sectioned day view (S-06).** The row stays flat/chronological.

## Implementation Approach

Four phases mirroring the S-01/S-02 slice shape — data layer, pure core, UI wiring,
verification — each independently verifiable.

1. **Data layer** — one additive migration adding `food_category text` (nullable)
   to `meal_entries`; the type additions; the `createMealEntry` whitelist entry.
2. **Emoji mapping core** — a pure `src/lib/food-emoji.ts` the smoke imports:
   a 40+ entry synonym table, `emojiForFood(text)`, and `iconForEntry(entry)`.
3. **Wire commit + render** — thread `food_category` through `review.tsx`; render
   `iconForEntry(entry)` in `MealEntryRow`.
4. **Verification** — smoke (mapping cases + `food_category` round-trip) + doc.

The **`iconForEntry(entry)`** function is the seam the UI shares with the smoke:
`MealEntryRow` and the verification script both resolve an entry's emoji through it,
so what the smoke asserts is exactly what the day view renders.

## Critical Implementation Details

**Match ordering is load-bearing.** `food_category` and `name` are free text, so
`emojiForFood` normalizes (lowercase, trim) and scans an **ordered** synonym list,
first match wins. More specific phrases must precede generic ones — `grilled
chicken` before `chicken`, `greek yogurt` before `yogurt`, `ice cream` before
`cream` — or the coarse entry shadows the specific one. Whole-word/substring
matching (not exact-key) is what lets one table serve both the model's labels and
raw meal names. This ordering is the single thing most likely to cause a wrong icon,
so the smoke pins several specificity-sensitive cases.

## Phase 1: Data layer

### Overview

Persist the category. One additive migration, the type additions, and the repo
whitelist entry — so a committed entry carries `food_category` and it round-trips.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_meal_entry_food_category.sql` (new)

**Intent**: Add a nullable column to hold the model's coarse food label so the
Today view can resolve an icon from stored data rather than re-estimating.

**Contract**: `alter table public.meal_entries add column food_category text;`
Nullable, no default, no backfill. No RLS change (column inherits the table's
row-level policies). Additive only.

#### 2. Types

**File**: `src/data/types.ts`

**Intent**: Expose the new column on the row and insert/patch shapes, mirroring the
existing nullable-field conventions.

**Contract**: Add `food_category: string | null` to `MealEntry`; add optional
`food_category?: string | null` to `NewMealEntry`; add `food_category` to the
`MealEntryPatch` `Pick` set (for a future FR-053 edit — no UI here).

#### 3. Repo whitelist

**File**: `src/data/meal-entries.repo.ts`

**Intent**: `createMealEntry` builds its insert row from an explicit field list, so
the new field must be added or it is silently dropped.

**Contract**: In the `row` object, add `food_category: input.food_category ?? null`.
`listMealEntriesForDay` / `updateMealEntry` need no change (`select('*')` and
pass-through patch respectively).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Migration applies cleanly to the deployed project (or local shadow) without error

#### Manual Verification:

- The `meal_entries` table shows the new nullable `food_category` column with RLS still enabled

**Implementation Note**: After automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Emoji mapping core

### Overview

The pure text→emoji mapping the UI and smoke share. Dependency-free so the Node
smoke imports it directly.

### Changes Required:

#### 1. Food emoji mapping

**File**: `src/lib/food-emoji.ts` (new)

**Intent**: Turn a food label or meal name into an emoji through an ordered synonym
table (40+ categories), and resolve an entry's icon from its category first, then
its name, then a generic fallback — kept out of any `react-native`-importing module
so the Node smoke can call it (the `sum-calories.ts` pattern).

**Contract**:
- A `GENERIC_FOOD` constant (e.g. `🍽️`) — the fallback.
- An ordered table of `{ match: string[]; emoji: string }` covering 40+ food
  categories (proteins: chicken/beef/pork/fish/eggs/tofu…; grains: rice/pasta/
  bread/cereal…; produce: apple/banana/salad/broccoli…; dairy: cheese/yogurt/milk;
  drinks: coffee/tea/beer/wine/water/juice; sweets: cake/cookie/chocolate/ice
  cream; prepared: pizza/burger/taco/sushi/sandwich/soup…). Specific phrases ordered
  before generic ones (see Critical Implementation Details).
- `emojiForFood(text: string | null | undefined): string` — normalizes (lowercase,
  trim) and returns the first entry whose any `match` token appears as a
  whole-word/substring in `text`, else `GENERIC_FOOD`. Total over every input
  (null/empty → generic).
- `iconForEntry(entry: { food_category: string | null; name: string }): string` —
  `emojiForFood(food_category)` if that yields a non-generic hit, else
  `emojiForFood(name)`, else `GENERIC_FOOD`. So a stored category wins, a name is
  the fallback, and generic is last.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- Spot-check a handful of labels/names by hand (e.g. "scrambled eggs"→🥚,
  "grilled chicken breast"→🍗, "pepperoni pizza"→🍕, "zxqw"→generic) and confirm the
  function agrees

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Wire commit + render

### Overview

Thread the category through the one place entries are written, and render the emoji
on the one place the day is read.

### Changes Required:

#### 1. Thread category on commit

**File**: `src/app/(today)/review.tsx`

**Intent**: Carry the estimate's `food_category` into the committed entry on the
recognized path so future reads have a specific icon; leave it null when the input
was unrecognized/manual (the name-derivation path covers those at render).

**Contract**: In the `create.mutate({…})` payload (`~:84`), add
`food_category: recognized ? estimate.food_category : null`. No other review
behavior changes.

#### 2. Render the icon

**File**: `src/components/meal-entry-row.tsx`

**Intent**: Show the resolved emoji at the start of each row so the day is
scannable (FR-061), without disturbing the existing name/calorie layout.

**Contract**: Compute `iconForEntry(entry)` and render it as a leading
`<ThemedText>` before the name (a fixed-width emoji cell, aligned with the existing
`Spacing` gaps). The name keeps `numberOfLines={2}` / `flexShrink`; calories
unchanged. Update the stale "food icon (S-05) belongs to a later slice" comment.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Web bundle builds: `npx expo export --platform web`

#### Manual Verification:

- Logging a recognized meal (e.g. "two scrambled eggs") shows a matching emoji on its Today row
- A manual/unrecognized entry shows a name-derived emoji, or the generic one when nothing matches
- Entries logged before this slice (null category) still show an icon via name-derivation
- The row layout stays legible in light and dark; long names still wrap without pushing the icon or calories off-row

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Verification

### Overview

Prove the mapping and the persistence automatically, matching the smoke pattern of
the shipped slices.

### Changes Required:

#### 1. Smoke script

**File**: `scripts/icon-smoke.ts`, `scripts/run-icon-smoke.mjs` (new), `package.json`

**Intent**: One command that machine-checks S-05's two core claims — the mapping is
correct and stable, and `food_category` round-trips through the real store.

**Contract**: `run-icon-smoke.mjs` reuses the esbuild `nodeShim` from
`run-estimate-smoke.mjs` verbatim. `icon-smoke.ts`:
- asserts `emojiForFood` / `iconForEntry` across representative cases: several
  recognized categories, the specificity-ordering cases ("grilled chicken" vs
  "chicken", "ice cream" vs "cream"), name-derivation when category is null, and
  the generic fallback for gibberish;
- signs in as the owner, `createMealEntry` with a `food_category`, reads the day
  back via `listMealEntriesForDay`, asserts the row carries the same
  `food_category` and that `iconForEntry` on the returned row matches the expected
  emoji, then hard-deletes the test row (the `smoke-store.ts` cleanup pattern).
- New `"smoke:icon"` script, same `--env-file` invocation.

#### 2. Verification doc

**File**: `context/changes/food-icon-system/verification.md` (new)

**Intent**: The durable record of how the slice was proven, in the archived-slice shape.

**Contract**: Sections for the automated smoke (recorded run + exit code), the manual
checks from Phases 1–3, any deviations, and Known Gaps (emoji style/platform
variance as the FR-051 compromise; deferred FR-053/054/055; no backfill).

### Success Criteria:

#### Automated Verification:

- Smoke passes end-to-end: `npm run smoke:icon` exits 0
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Prior smokes still pass: `npm run smoke`, `npm run smoke:profile`, `npm run smoke:log`, `npm run smoke:estimate`

#### Manual Verification:

- The full log → icon-on-Today loop works on a device or simulator
- `verification.md` records a real run with its output

---

## Testing Strategy

No test runner exists and this slice does not add one — verification follows the
repo's established smoke pattern.

### Automated (smoke + static):

- `npm run smoke:icon` — mapping cases (including specificity ordering and fallback)
  and a `food_category` store round-trip, against the deployed backend
- `npx tsc --noEmit` and `npm run lint` on every phase
- `npx expo export --platform web` as the bundler-level check

### Manual Testing Steps:

1. Log "two scrambled eggs" — confirm an egg emoji on its Today row
2. Log "pepperoni pizza" — confirm a pizza emoji
3. Log a gibberish/manual entry — confirm a name-derived emoji or the generic one
4. Confirm an entry logged before this slice still shows an icon (name-derived)
5. Check light and dark, and a long meal name — layout stays legible, icon and calories stay on-row

## Performance Considerations

Icon resolution is a synchronous scan of a fixed ~40-entry table per row render —
negligible, and re-running it per render is fine (no memoization needed). No per-entry
image loading or network. The table is a module constant, allocated once.

## Migration Notes

Additive only — one nullable column on `meal_entries`, no change to existing rows or
other tables. The app degrades gracefully: before the migration and for any null
category, the row renders a name-derived or generic emoji. No backfill.

## References

- Roadmap slice S-05: `context/foundation/roadmap.md`
- PRD: US-13; FR-050/051/052 (must-have), FR-053/054/055 (deferred), FR-061; OQ-2, `context/foundation/prd.md`
- Category source: `src/data/estimation-types.ts:25` (`food_category`), `supabase/functions/estimate/estimate.ts:28-29` (prompt)
- Commit path to thread: `src/app/(today)/review.tsx:84`, `src/data/meal-entries.repo.ts:23`
- Render target: `src/components/meal-entry-row.tsx`
- Pure-lib pattern the smoke imports: `src/lib/sum-calories.ts`, `src/lib/derive-targets.ts`
- Smoke-runner shim + store round-trip pattern: `scripts/run-estimate-smoke.mjs`, `scripts/smoke-store.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — 54c2496
- [x] 1.2 Linting passes: `npm run lint` — 54c2496
- [x] 1.3 Migration applies cleanly to the deployed project (or local shadow) without error — 54c2496

#### Manual

- [x] 1.4 The `meal_entries` table shows the new nullable `food_category` column with RLS still enabled — 54c2496

### Phase 2: Emoji mapping core

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` — acae521
- [x] 2.2 Linting passes: `npm run lint` — acae521
- [x] 2.3 Web bundle builds: `npx expo export --platform web` — acae521

#### Manual

- [x] 2.4 Spot-check a handful of labels/names by hand and confirm the function agrees — acae521

### Phase 3: Wire commit + render

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Web bundle builds: `npx expo export --platform web`

#### Manual

- [x] 3.4 Logging a recognized meal shows a matching emoji on its Today row
- [x] 3.5 A manual/unrecognized entry shows a name-derived emoji, or the generic one when nothing matches
- [x] 3.6 Entries logged before this slice (null category) still show an icon via name-derivation
- [x] 3.7 The row layout stays legible in light and dark; long names still wrap without pushing the icon or calories off-row

### Phase 4: Verification

#### Automated

- [ ] 4.1 Smoke passes end-to-end: `npm run smoke:icon` exits 0
- [ ] 4.2 Type checking passes: `npx tsc --noEmit`
- [ ] 4.3 Linting passes: `npm run lint`
- [ ] 4.4 Prior smokes still pass: `npm run smoke`, `npm run smoke:profile`, `npm run smoke:log`, `npm run smoke:estimate`

#### Manual

- [ ] 4.5 The full log → icon-on-Today loop works on a device or simulator
- [ ] 4.6 `verification.md` records a real run with its output
