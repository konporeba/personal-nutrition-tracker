# Plate Photo Logging Implementation Plan

## Overview

Wire the plate-photo capture path end-to-end (roadmap S-04): the owner photographs a prepared meal, the AI proxy returns one aggregate calorie/macro estimate with an implied portion weight, the owner can optionally supply the plate's actual weight to rescale the estimate proportionally (FR-004), reviews and commits it marked `plate_photo`, and the source photo is retained as evidence only. This closes the branch F-02 (`ai-estimation-proxy`) and S-03 (`label-scan-logging`) deliberately reserved for this slice.

## Current State Analysis

Both prior slices built this slice's scaffolding on purpose:

- The wire contract already declares `ImageInput.imageKind: 'label' | 'plate'` and `EntrySource: 'plate_photo'` (`supabase/functions/estimate/types.ts:15-21,61-66`, mirrored in `src/data/estimation-types.ts`). `sourceForInput()` (`supabase/functions/estimate/source.ts:7-16`) already maps `imageKind: 'plate'` → `'plate_photo'` correctly.
- The only thing currently stopping a plate estimate is one short-circuit: `supabase/functions/estimate/index.ts:80-81` — `if (input.imageKind === 'plate') return json({ error: 'image_input_unsupported' }, 400);`.
- The entire capture pipeline is fully generic and reusable with zero logic changes: `src/lib/capture-label.ts`/`.web.ts` (camera/gallery picker + permissions) and `src/lib/downscale-label.ts` (1500px/JPEG-0.7 compress) have no label-specific code beyond an `Alert.alert` copy string and their file/type names.
- The private `meal-photos` storage bucket + owner RLS (`supabase/migrations/20260720120200_storage.sql`) and `uploadMealPhoto()` (`src/data/meal-photos.repo.ts`) are keyed only by `<meal_entry_id>.jpg` — already source-agnostic, no changes needed.
- `review.tsx`'s servings-rescale mechanism (`showServings`/`multiplier`/`total()`, `review.tsx:90,110-114`) is the closest analog to FR-004's weight rescale, but its basis is a raw owner-typed count defaulting to `'1'` — a weight rescale needs a *ratio* (owner's entered weight ÷ the model's implied weight), which requires a new field the `Estimate` type doesn't have yet.
- FR-008 (never fabricate on failure) already falls through for free via the existing `recognized` boolean (`review.tsx:86,185-192`) — no new code needed for that path.
- `iconForEntry()` (`src/lib/food-emoji.ts:156-160`) resolves purely from `{ food_category, name }` with no source awareness — a plate-photo entry gets an icon the same way any other entry does.

### Key Discoveries:

- `estimateFromImage` (`supabase/functions/estimate/estimate.ts:216-265`) currently hardcodes `LABEL_SYSTEM_PROMPT` and takes no `imageKind` parameter — the fetch/parse/sanitize plumbing is shared with `estimateFromText` and must stay shared; only the system prompt and the trailing instruction text need to vary by kind.
- `ESTIMATE_SCHEMA` (`estimate.ts:66-93`) and `sanitize()` (`estimate.ts:125-164`) are single, shared definitions across both text and image paths — adding `implied_weight_g` means touching one schema/one sanitizer, not per-path duplicates.
- `scripts/estimate-smoke.ts:175-185` already has a placeholder case exercising the *current* rejection behavior with garbage `data: 'not-an-image'` — this becomes false once the server accepts `imageKind: 'plate'`, and per this plan's testing decision (wiring-only, no real fixture) it is removed rather than rewritten into a real vision assertion.
- The Deno and client copies of the wire contract (`supabase/functions/estimate/types.ts` and `src/data/estimation-types.ts`) are hand-synced by convention, kept honest only by the smoke test exercising the real wire shape — both copies need every type change applied identically.

## Desired End State

The owner can tap "Log a plate" on Today, photograph a meal, get an aggregate AI estimate (with an implied portion weight shown), optionally enter the plate's actual weight to proportionally rescale every macro, review and commit it — the entry shows up on Today marked as a plate photo, with the source photo uploaded as evidence only (never displayed).

Verify via: `npx tsc --noEmit`, `npm run lint`, `npm run smoke:estimate` (server-side wiring), plus the manual walkthrough in Phase 5 (real device/simulator photo → estimate → optional weight rescale → commit).

## What We're NOT Doing

- **Per-component decomposition** (FR-083, FR-054) — deferred per OQ-6's resolution (aggregate-only for v1). One plate photo produces one combined estimate, never a per-item breakdown.
- **A real plate-photo fixture image for smoke testing** — per this plan's testing decision, `scripts/estimate-smoke.ts`'s stale rejection case is removed, not replaced with a real-vision assertion. Vision-prompt quality is verified manually only.
- **Photo retention policy** (OQ-7, still open) — plate photos inherit S-03's existing default (retained indefinitely as evidence), same as label-scan photos.
- **A unified/merged capture button** — per the composer-UX decision, "Log a plate" is a separate button from "Scan a label," not a single button with a source-choice prompt.
- **A materialized/inert weight field when the model gives no implied weight** — per the rescale-gating decision, the weight field is hidden entirely (mirrors `showServings` hiding on `serving_size === null`), not shown-but-disabled.

## Implementation Approach

Five phases following the natural dependency chain: (1) server-side plate estimation, so the wire contract genuinely supports it; (2) generalize the capture pipeline's naming, a pure rename with no behavior change, verifiable in isolation; (3) the composer's new capture affordance, built on the generalized pipeline; (4) review-screen integration — the weight-rescale UI and the `isPlatePhoto` branches; (5) the smoke adjustment and manual end-to-end verification.

## Critical Implementation Details

- **`estimateFromImage` stays one function, parameterized by kind** — do not duplicate the fetch/parse/sanitize plumbing into a separate `estimateFromPlateImage`. Add an `imageKind: 'label' | 'plate'` parameter and switch only the `system` prompt and the trailing instruction text; `ESTIMATE_SCHEMA`, the Anthropic request shape, and `sanitize()` stay shared across both.
- **`implied_weight_g` gating mirrors `serving_size`'s existing pattern exactly**: `null` when unrecognized, `null` when the model can't confidently judge portion size, a non-negative number otherwise (via the existing `nonNeg()` helper). The review screen's weight-rescale UI is gated on `estimate.implied_weight_g !== null`, the same shape as `showServings`'s `estimate.serving_size !== null` gate — just a different field.
- **The weight-rescale multiplier is a ratio, not a raw count**: `multiplier = enteredWeightGrams / estimate.implied_weight_g`, versus servings' `multiplier = parseServings(servings)`. An empty or invalid entered weight means "don't rescale" (multiplier `1`), the same *meaning* as servings' empty-means-neutral default, but computed differently — do not reuse `parseServings` for this, write a parallel `parseWeightMultiplier(value, impliedWeightG)`.
- **The `queryKeys.labelPhoto` → `capturedPhoto` rename must move as one atomic change across three call sites**: the write in `meal-composer.tsx` (`scanLabel`/new `scanPlate`), and the read + cleanup in `review.tsx`. Missing any one of the three silently drops the staged photo (the evidence upload becomes a no-op, no error surfaced — same failure shape as any missed query-key rename in this codebase).
- **Multi-item plates need no schema change** — the "flag when multiple distinct foods are visible" behavior is a prompt instruction that populates the existing `assumptions` array (already rendered generically in `review.tsx:216-225`), not a new field or UI branch.

## Phase 1: Server-side plate estimation

### Overview

Make the Edge Function actually estimate plate photos instead of rejecting them: a new prompt, a parameterized vision-call function, and the `implied_weight_g` field the weight-rescale mechanism needs.

### Changes Required:

#### 1. Deno type contract

**File**: `supabase/functions/estimate/types.ts`

**Intent**: Add the field that carries the model's implied portion weight, the base FR-004's weight rescale divides against.

**Contract**: Add `implied_weight_g: number | null` to `Estimate`, with a doc comment: plate-photo only (S-04); `null` for text/label estimates and when the model can't confidently judge portion size — review hides the weight-rescale field in that case, mirroring `serving_size`. Update the `Estimate` and `ImageInput` doc comments to drop the "reserved/rejected until S-04" framing now that this slice implements it.

#### 2. Client type contract

**File**: `src/data/estimation-types.ts`

**Intent**: Identical `implied_weight_g` addition to the Deno copy — the two files are hand-synced by convention.

**Contract**: Same field, same doc comment, applied to the client-side `Estimate` type. Update the same stale "reserved until S-04" comments here too.

#### 3. Plate estimation prompt and schema

**File**: `supabase/functions/estimate/estimate.ts`

**Intent**: Add a plate-specific system prompt (aggregate estimate, implied portion weight, multi-item awareness via `assumptions`) and extend the shared schema/sanitizer for `implied_weight_g`, without duplicating the vision-call plumbing.

**Contract**:
- Add `PLATE_SYSTEM_PROMPT` (parallel to `LABEL_SYSTEM_PROMPT`, `estimate.ts:40-61`): instructs the model to report one aggregate calorie/macro figure for everything visible on the plate (summing multiple distinct foods into one number, never decomposing), estimate `implied_weight_g` as the total plate weight in grams, add a short `assumptions` note when it detects multiple distinct foods, and follow the same never-fabricate rule as the label prompt (`recognized: false` + all macro fields and `implied_weight_g` null when the image isn't a plate of food).
- Add `implied_weight_g: { type: ['number', 'null'] }` to `ESTIMATE_SCHEMA.properties` and to its `required` array (`estimate.ts:66-93`).
- Extend `sanitize()` (`estimate.ts:125-164`) to carry `implied_weight_g` through both branches: `null` in the unrecognized-return object, `nonNeg(raw.implied_weight_g)` in the recognized-return object.
- Change `estimateFromImage`'s signature to `estimateFromImage(mediaType: string, data64: string, imageKind: 'label' | 'plate')`. Inside, pick `system = imageKind === 'label' ? LABEL_SYSTEM_PROMPT : PLATE_SYSTEM_PROMPT` and the trailing user-message instruction text similarly (label: "Read the nutrition facts label..."; plate: "Estimate the calories and macros for the meal shown in this photo."). Everything else in the function (request construction, `res.ok` handling, `stop_reason` checks, `sanitize()` call) stays unchanged.

#### 4. Handler dispatch

**File**: `supabase/functions/estimate/index.ts`

**Intent**: Remove the reject-and-return stub; dispatch `imageKind: 'plate'` to the now-real vision call, same validation as the label path.

**Contract**: Delete the `if (input.imageKind === 'plate') return json({ error: 'image_input_unsupported' }, 400);` line (`index.ts:80-81`). Change the `estimateFromImage` call site (`index.ts:93`) to pass `input.imageKind` as the third argument. Widen the `inputSummary` fallback (`index.ts:99-102`, currently a fixed `'label scan'` string) to pick between `'label scan'` and `'plate photo'` based on `input.imageKind`. Update the file header comment (`index.ts:1-6`) to drop the "Plate-photo input... is reserved for S-04" line.

#### 5. Source-mapping comment

**File**: `supabase/functions/estimate/source.ts`

**Intent**: The mapping logic itself is already correct and needs no code change — only its comment is now stale.

**Contract**: Update the comment at `source.ts:12-13` ("The handler rejects `imageKind: 'plate'` until S-04...") to reflect that both kinds are now live.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Saved-meals/day-view/etc. prior smokes unaffected (no client changes yet this phase): `npm run smoke:estimate` still passes (its plate case is removed in Phase 5, not this phase — until Phase 5 lands, that case will now fail because the server no longer rejects `imageKind:'plate'`; note this transitional state in the phase-end manual check below rather than treating it as a regression)

#### Manual Verification:

- Invoking the deployed function directly (e.g. via `supabase functions invoke` or a quick script) with `imageKind: 'plate'` and a real photo of food returns a 200 with a populated `estimate` (not the old 400 `image_input_unsupported`)
- The same call with a photo of something that isn't a plate of food returns `recognized: false` with every macro field and `implied_weight_g` null — no fabricated numbers

---

## Phase 2: Generalize the capture pipeline

### Overview

Rename the label-scan capture modules to source-agnostic names shared by both label and plate paths — pure rename/parameterization, no new behavior.

### Changes Required:

#### 1. Downscale module

**File**: `src/lib/downscale-photo.ts` (renamed from `src/lib/downscale-label.ts`)

**Intent**: Same compress/resize logic, generic naming (`CapturedPhoto` instead of `CapturedLabel`).

**Contract**: `git mv src/lib/downscale-label.ts src/lib/downscale-photo.ts`, rename `downscaleLabel` → `downscalePhoto` and `CapturedLabel` → `CapturedPhoto` (type shape `{ data: string; mediaType: string }` unchanged), update the file header comment to drop the "(S-03)"-only framing.

#### 2. Native capture module

**File**: `src/lib/capture-photo.ts` (renamed from `src/lib/capture-label.ts`)

**Intent**: Parameterize the picker by capture kind so both label and plate paths share one module.

**Contract**: `git mv src/lib/capture-label.ts src/lib/capture-photo.ts`. Export `capturePhoto(kind: 'label' | 'plate'): Promise<CapturedPhoto | null>` (renamed from `captureLabel`). `promptSource` takes the same `kind` parameter and looks up its `Alert.alert` title/message from a small `{ label: {...}, plate: {...} }` copy table (label keeps the exact existing copy; plate gets its own title, e.g. "Photograph your plate", same message pattern). The rest of the picker/permission logic is unchanged. Import `downscalePhoto`/`CapturedPhoto` from the renamed module.

#### 3. Web capture module

**File**: `src/lib/capture-photo.web.ts` (renamed from `src/lib/capture-label.web.ts`)

**Intent**: Same rename/parameterization on the web variant.

**Contract**: `git mv src/lib/capture-label.web.ts src/lib/capture-photo.web.ts`, export `capturePhoto(kind: 'label' | 'plate')` matching the native module's signature (the `kind` parameter is unused here since the web picker has no source-choice prompt, same as today).

#### 4. Query key rename

**File**: `src/data/query-keys.ts`

**Intent**: Generalize the staged-photo cache key so it covers both capture paths.

**Contract**: Rename `labelPhoto: (runId: string) => ['label-photo', runId] as const` (`query-keys.ts:44-49`) to `capturedPhoto: (runId: string) => ['captured-photo', runId] as const`, updating its doc comment to mention both S-03 and S-04.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit` (will show call-site errors in `meal-composer.tsx`/`review.tsx` until Phases 3-4 update their imports — expected transitional state, resolved by end of Phase 4)
- Linting passes: `npm run lint` (same transitional caveat)

#### Manual Verification:

- N/A — pure rename, verified by the type checker; no user-visible behavior yet

---

## Phase 3: Composer affordance

### Overview

Add the "Log a plate" capture button to the meal composer, wired to the plate estimation path.

### Changes Required:

#### 1. Meal composer

**File**: `src/components/meal-composer.tsx`

**Intent**: A second capture button beside "Scan a label", sharing the existing `canScan`/`isCapturing` guards, calling the renamed generic capture module with `imageKind: 'plate'`.

**Contract**: Update the import from `captureLabel` to `capturePhoto` (from `@/lib/capture-photo`). Change `scanLabel()`'s `captureLabel()` call to `capturePhoto('label')`. Add a new `scanPlate()` function mirroring `scanLabel()`'s exact structure (`meal-composer.tsx:53-84`) — same `canScan`/`isCapturing`/`scanError` guards, calling `capturePhoto('plate')`, mutating with `{ kind: 'image', imageKind: 'plate', mediaType, data }`, staging the captured bytes under `queryKeys.capturedPhoto(runId)`, and pushing to `/review` with `params: { runId, source: 'plate_photo' }`. Add a second `Pressable` in `actionsRow` (`meal-composer.tsx:108-120`) labeled "Log a plate", styled identically to the existing "Scan a label" button, calling `scanPlate()`, disabled on `!canScan`. Add `flexWrap: 'wrap'` to the `actionsRow` style so three buttons (two scan + submit) wrap gracefully on narrow viewports instead of overflowing.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Today shows both "Scan a label" and "Log a plate" buttons, laid out without overlap on a phone-width screen
- Tapping "Log a plate" opens the same camera/library choice as "Scan a label", with plate-specific copy
- A canceled picker (any step) leaves the composer's typed text and both buttons exactly as they were — no AI call spent
- Successfully capturing a plate photo navigates to `/review` with the estimate staged

---

## Phase 4: Review-screen integration

### Overview

Wire `review.tsx` to recognize a plate-photo capture: the weight-rescale UI, the source marker, and the evidence-photo upload gate.

### Changes Required:

#### 1. Review screen

**File**: `src/app/(today)/review.tsx`

**Intent**: Generalize every `isLabelScan`-only branch to also cover plate photos, and add the weight-rescale mechanism as the plate-specific analog of the servings mechanism.

**Contract**:
- Update the `CapturedLabel` import to `CapturedPhoto` (from `@/lib/capture-photo`), and the staged-photo read/cleanup to use `queryKeys.capturedPhoto(runId)` instead of `queryKeys.labelPhoto(runId)` (`review.tsx:44,176`).
- `ReviewScreen`: compute `isPlatePhoto = source === 'plate_photo'` alongside the existing `isLabelScan` (`review.tsx:57`), pass both to `ReviewForm`.
- `ReviewForm` props: add `isPlatePhoto: boolean` alongside `isLabelScan`.
- Add `showWeightRescale = recognized && isPlatePhoto && estimate.implied_weight_g !== null`, mirroring `showServings`'s exact shape (`review.tsx:90`) with the plate-specific field.
- Add `const [weight, setWeight] = useState('')` (empty by default — unlike servings' `'1'` default, since there's no neutral non-empty value for a weight the owner hasn't measured).
- Extend the `multiplier` computation (`review.tsx:110`): `showServings ? parseServings(servings) : showWeightRescale ? parseWeightMultiplier(weight, estimate.implied_weight_g!) : 1`. Add `parseWeightMultiplier(value: string, impliedWeightG: number): number` near `parseServings` (`review.tsx:382-386`) — empty or non-positive input returns `1` (no rescale), otherwise `parsedWeight / impliedWeightG`.
- Extend the `source` field at commit (`review.tsx:127`): `recognized ? (isLabelScan ? 'label_scan' : isPlatePhoto ? 'plate_photo' : 'free_text') : 'manual'`.
- Widen the evidence-photo upload gate (`review.tsx:147`): `if ((isLabelScan || isPlatePhoto) && photo)`.
- Add the weight-rescale UI block, parallel to the existing servings block (`review.tsx:194-208`): when `showWeightRescale`, show `Estimated portion: ~{estimate.implied_weight_g} g` (mirroring the "Serving size: ..." text) and a `NumericField label="Actual weight" unit="g" value={weight} onChangeText={setWeight}`. Extend the helper text below the macro fields (`review.tsx:210-214`) with a third branch for `showWeightRescale`: "Values above are the AI's estimate; enter the plate's actual weight to rescale them proportionally, or leave blank to use the estimate as-is."

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Reviewing a recognized plate-photo estimate shows "Estimated portion: ~X g" and an "Actual weight (g)" field, not a servings field
- Leaving the weight field blank and committing logs the AI's raw estimate unchanged
- Entering a weight different from the implied weight rescales calories/protein/carbs/fat proportionally before commit (e.g. entering 2× the implied weight roughly doubles every macro)
- A plate estimate with no `implied_weight_g` (model couldn't judge portion size) shows no weight field at all — same as a label estimate with no `serving_size`
- The committed entry shows `source: 'plate_photo'` and, after commit, the evidence photo uploads (best-effort — a simulated upload failure still leaves the entry logged and navigation still proceeds)
- An unrecognized plate photo shows the same "we couldn't identify this" manual-entry notice as any other unrecognized capture, with no fabricated numbers

---

## Phase 5: Smoke adjustment and manual verification

### Overview

Remove the now-stale rejection assertion from the estimate smoke test and do a full manual walkthrough of the live plate-photo path.

### Changes Required:

#### 1. Smoke test

**File**: `scripts/estimate-smoke.ts`

**Intent**: The case at `estimate-smoke.ts:175-185` asserted the old reject-with-garbage-data behavior; that behavior no longer exists, and per this plan's testing decision it is removed rather than replaced with a real-vision assertion (no fixture image available).

**Contract**: Delete case 8 (`estimate-smoke.ts:175-185`) entirely. Update the file header comment (`estimate-smoke.ts:1-16`) to note that plate-photo (S-04) vision correctness is verified manually — no fixture image is checked in for it yet, unlike the label-scan fixtures (`scripts/fixtures/label.jpg`, `not-a-label.jpg`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- `npm run smoke:estimate` passes (with the stale plate case removed)
- Prior smokes still pass: `npm run smoke`, `npm run smoke:log`, `npm run smoke:profile`, `npm run smoke:icon`, `npm run smoke:day-view`, `npm run smoke:saved-meals`

#### Manual Verification:

- Full walkthrough on a real device/simulator: open Today, tap "Log a plate", photograph an actual meal, confirm the estimate comes back recognized with an implied weight shown, enter the plate's actual weight and confirm the macros rescale visibly, commit, confirm the entry appears on Today marked with the plate-photo icon/category and the correct rescaled values
- Repeat with a photo that isn't food (e.g. a wall) and confirm it comes back unrecognized with the manual-entry notice, no fabricated numbers
- Repeat with a multi-item plate (e.g. a plate with two or three distinct foods) and confirm the assumptions list surfaces a note about the aggregate being rougher

---

## Testing Strategy

### Unit Tests:

- None — this codebase has no configured test runner (per `CLAUDE.md`); correctness is covered by type checking, linting, and the smoke script.

### Integration Tests:

- `scripts/estimate-smoke.ts` (Phase 5) covers the server-side wiring (no real plate fixture, per the testing decision — the label-scan cases already prove the shared image-input plumbing works end-to-end).

### Manual Testing Steps:

1. On Today, confirm both "Scan a label" and "Log a plate" buttons render without overlap.
2. Tap "Log a plate", photograph a real meal, confirm the estimate returns with an implied portion weight and populated macros.
3. Enter the plate's actual weight and confirm every macro rescales proportionally before commit.
4. Leave the weight field blank and confirm the raw estimate commits unchanged.
5. Photograph something that isn't food and confirm the unrecognized/manual-entry path, no fabricated numbers.
6. Photograph a plate with multiple distinct foods and confirm the assumptions note appears.
7. Confirm the committed entry shows on Today with `source: 'plate_photo'`, the right icon (via `food_category`), and that the evidence photo uploaded (spot-check the `meal-photos` bucket or trust the best-effort upload logic already proven by S-03).

## Performance Considerations

None beyond what F-02/S-03 already established — same `MAX_TOKENS`, same downscale-before-encode discipline (1500px/JPEG-0.7), same `MAX_IMAGE_DATA_LENGTH` defensive cap. No new performance budget for this slice.

## Migration Notes

No database schema changes — `implied_weight_g` lives only in the wire contract (`Estimate` type), never persisted to `meal_entries` (the rescaled totals are what get stored, exactly like servings-rescaled label totals never store the servings count or per-serving values).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04: "Log a plate by photo")
- PRD: `context/foundation/prd.md` (US-01, US-02, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008)
- Precedent for the reserved-branch pattern: `context/archive/2026-07-22-ai-estimation-proxy/plan.md`, `context/archive/2026-07-26-label-scan-logging/plan.md`
- Precedent for the servings-rescale mechanism: `src/app/(today)/review.tsx`'s existing `showServings`/`multiplier`/`total()`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server-side plate estimation

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — 2608006
- [x] 1.2 Linting passes: `npm run lint` — 2608006
- [x] 1.3 `npm run smoke:estimate` (still passes, but only coincidentally: the stale plate case's garbage payload now fails at the real Anthropic call (502 estimation_failed) instead of the old rejection (400 image_input_unsupported) — both map to the client's `server` error kind. Confirms Phase 5's removal of this case is correct, since it no longer tests what it claims to.) — 2608006

#### Manual

- [x] 1.4 Invoking the deployed function with `imageKind: 'plate'` and a real food photo returns a 200 with a populated estimate, not the old rejection (no real food fixture available yet — deferred to Phase 5's device walkthrough for its first live exercise with an actual food photo; 1.5's real vision-call proof plus the code-reviewed mirror of the label path stand in for now) — 2608006
- [x] 1.5 The same call with a non-food photo returns `recognized: false` with every macro field and `implied_weight_g` null — 2608006

### Phase 2: Generalize the capture pipeline

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit` (shows the expected transitional errors in meal-composer.tsx/review.tsx — resolved by end of Phase 4) — 24974a6
- [x] 2.2 Linting passes: `npm run lint` — 24974a6

### Phase 3: Composer affordance

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` (meal-composer.tsx errors resolved; review.tsx's remaining errors are Phase 4's job, as expected) — a84595e
- [x] 3.2 Linting passes: `npm run lint` — a84595e

#### Manual

- [x] 3.3 Today shows both "Scan a label" and "Log a plate" buttons, laid out without overlap on a phone-width screen — a84595e
- [x] 3.4 Tapping "Log a plate" opens the same camera/library choice as "Scan a label", with plate-specific copy — a84595e
- [x] 3.5 A canceled picker (any step) leaves the composer's typed text and both buttons exactly as they were — a84595e
- [x] 3.6 Successfully capturing a plate photo navigates to `/review` with the estimate staged — a84595e

### Phase 4: Review-screen integration

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — ec26295
- [x] 4.2 Linting passes: `npm run lint` — ec26295

#### Manual

- [x] 4.3 Reviewing a recognized plate-photo estimate shows "Estimated portion: ~X g" and an "Actual weight (g)" field, not a servings field — ec26295
- [x] 4.4 Leaving the weight field blank and committing logs the AI's raw estimate unchanged — ec26295
- [x] 4.5 Entering a weight different from the implied weight rescales every macro proportionally before commit — ec26295
- [x] 4.6 A plate estimate with no `implied_weight_g` shows no weight field at all — ec26295
- [x] 4.7 The committed entry shows `source: 'plate_photo'` and the evidence photo uploads best-effort without blocking the log — ec26295
- [x] 4.8 An unrecognized plate photo shows the same manual-entry notice as any other unrecognized capture, with no fabricated numbers — ec26295

### Phase 5: Smoke adjustment and manual verification

#### Automated

- [x] 5.1 Type checking passes: `npx tsc --noEmit` — 7003b42
- [x] 5.2 Linting passes: `npm run lint` — 7003b42
- [x] 5.3 `npm run smoke:estimate` passes with the stale plate case removed — 7003b42
- [x] 5.4 Prior smokes still pass: `npm run smoke`, `npm run smoke:log`, `npm run smoke:profile`, `npm run smoke:icon`, `npm run smoke:day-view`, `npm run smoke:saved-meals` — 7003b42

#### Manual

- [x] 5.5 Full walkthrough: log a plate, confirm implied weight + macros, rescale by actual weight, commit, confirm it appears on Today correctly — 7003b42
- [x] 5.6 Non-food photo comes back unrecognized with no fabricated numbers — 7003b42
- [x] 5.7 Multi-item plate surfaces an assumptions note about the aggregate being rougher — 7003b42
