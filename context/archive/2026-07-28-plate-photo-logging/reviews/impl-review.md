<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Plate Photo Logging Implementation Plan

- **Plan**: context/changes/plate-photo-logging/plan.md
- **Scope**: Phase 5 of 5 (full plan review)
- **Date**: 2026-07-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Notes

- The drift-detection agent found **zero drift** across all 5 phases — every planned change matches its stated Intent/Contract exactly, including the subtler correctness properties: a single parameterized `estimateFromImage` (no duplicated vision-call plumbing), a ratio-based `parseWeightMultiplier` (not reused/aliased servings logic), an atomic 3-site `queryKeys.labelPhoto` → `capturedPhoto` rename (zero stale references anywhere in `src/`), and multi-item plate handling that adds no new schema field (reuses the existing `assumptions` array).
- No unplanned files were touched. No database migration changes — `git diff` across the full commit range touches zero files under `supabase/migrations/`, confirming `implied_weight_g` lives only in the wire contract, never persisted to `meal_entries`.
- All automated success criteria re-verified in this review session: `npx tsc --noEmit` (clean), `npm run lint` (clean), `npm run smoke:estimate` (passes with the stale plate-rejection case gone).
- Security/authz posture on the Edge Function is unchanged and correctly reused for the plate path (owner-session check, RLS-scoped run recording, API key server-side only).

## Findings

### F1 — Divide-by-zero in weight-rescale multiplier silently nulls owner-entered macros

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/(today)/review.tsx:426-431 (`parseWeightMultiplier`), called at :123
- **Detail**: `parseWeightMultiplier` guards the owner's entered weight against non-positive values but not the denominator, `estimate.implied_weight_g`. The server's `sanitize()` (`nonNeg`) explicitly allows `0` as a valid value, so a model response of `implied_weight_g: 0` (plausible on a near-empty or oddly-photographed plate) reaches the client untouched. If the owner then types an actual weight, `parsed / 0` is `Infinity` (or `NaN` if they also type `0`), and every rescaled macro field becomes `Infinity`/`NaN` — which `JSON.stringify` serializes to `null`. The practical effect: calorie/protein/carb/fat values the owner explicitly typed and confirmed are silently dropped to null on save, with no error shown.
- **Fix**: Guard the denominator too: `Number.isFinite(parsed) && parsed > 0 && impliedWeightG > 0 ? parsed / impliedWeightG : 1` (or tighten `showWeightRescale` to also require `estimate.implied_weight_g > 0`, so a non-positive implied weight never renders the rescale field in the first place).
- **Decision**: FIXED — `impliedWeightG > 0` added to `parseWeightMultiplier`'s guard in `src/app/(today)/review.tsx`. `npx tsc --noEmit` and `npm run lint` both re-verified clean.

### F2 — Non-exhaustive label/plate branching in two files risks silent misrouting for a future third kind

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/functions/estimate/estimate.ts:262-266; supabase/functions/estimate/source.ts:8-16
- **Detail**: `capture-photo.ts`'s `capturePhoto`/`promptSource` treat `label`/`plate` fully symmetrically via a `Record<'label' | 'plate', ...>` that forces both keys to exist at the type level — a third kind would be a compile error until updated, which is the right shape for extensibility. `estimate.ts` (`system`/`instruction` selection) and `source.ts` (`sourceForInput`'s image case) instead use `imageKind === 'label' ? X : Y` ternaries, where `plate` is the implicit "everything else" branch. This slice is exactly the moment `plate` became a real, non-rejected branch — a natural point to harden it. As written, a future third `imageKind` would silently misclassify as `plate_photo`/`PLATE_SYSTEM_PROMPT` with no compiler error.
- **Fix**: Convert both ternaries to exhaustive `switch` statements with a `never`-typed default (or an object map keyed by the literal union, mirroring `capture-photo.ts`'s existing `Record` approach), so a third kind becomes a compile-time forcing function instead of a silent runtime default.
- **Decision**: FIXED — `source.ts`'s `sourceForInput` and `estimate.ts`'s new `promptFor` helper both use exhaustive `switch` statements with a `never`-typed default. Redeployed to the live Edge Function (version 10) and re-verified with `npm run smoke:estimate` (all cases pass, including the label path routed through the new switch).

### F3 — Pre-existing composer race: `canSubmit` isn't gated on `isCapturing`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/components/meal-composer.tsx:29-34
- **Detail**: `scanPlate()` shares `isCapturing`/`canScan` symmetrically with `scanLabel()` — no new race between the two scan buttons. But `canSubmit` (the text-estimate button) doesn't include `!isCapturing`, so during the picker/downscale window it stays enabled if there's typed text. Since `useEstimateMeal()` is one shared mutation, tapping "Estimate" during that window while a scan's `capturePhoto()` is still resolving could fire two `mutate()` calls in close succession. This predates the plate-photo slice (already existed for text+label) and `scanPlate()` doesn't make it worse — flagged because it's directly adjacent to the guard logic this review examined.
- **Fix**: Add `!isCapturing` to `canSubmit`'s definition, matching `canScan`'s existing guard.
- **Decision**: FIXED — `!isCapturing` added to `canSubmit` in `src/components/meal-composer.tsx`. `npx tsc --noEmit` and `npm run lint` both re-verified clean.

### F4 — Stale docstring doesn't mention the plate-photo path

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/data/use-estimate.ts:40
- **Detail**: `useEstimateMeal`'s docstring reads "Estimate a meal — free-text (S-01) or a photographed label (S-03)." This hook's `mutationFn` is what `scanPlate()` now drives too, but the file wasn't touched by this slice's diff, so the comment wasn't updated.
- **Fix**: Update the docstring to also mention "or a photographed plate (S-04)."
- **Decision**: FIXED — docstring updated in `src/data/use-estimate.ts`. `npx tsc --noEmit` re-verified clean.

### F5 — No automated coverage for real plate-photo vision correctness

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: scripts/estimate-smoke.ts
- **Detail**: Per this plan's explicit testing decision, the stale rejection assertion was removed with no replacement — plate-photo vision correctness (recognized macros, correct `source`, non-fabrication on a bad image) has no automated safety net today, unlike the label path (which has fixture-backed cases). This is a documented, deliberate tradeoff from planning, not an oversight.
- **Fix**: None required now — documented for the record. A future follow-up could add `scripts/fixtures/plate.jpg` + a non-plate fixture and mirror the label path's fixture-backed assertions.
- **Decision**: SKIPPED — deliberate, already-documented tradeoff from planning; no action needed now.
