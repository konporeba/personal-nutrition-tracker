# Plate Photo Logging — Plan Brief

> Full plan: `context/changes/plate-photo-logging/plan.md`

## What & Why

Wire the plate-photo capture path (roadmap S-04): photograph a prepared meal, get an aggregate AI estimate with an implied portion weight, optionally supply the plate's actual weight to rescale the estimate proportionally (FR-004), review and commit it marked `plate_photo`. This closes a branch two prior slices (F-02, S-03) deliberately left stubbed specifically for this feature.

## Starting Point

The wire contract already declares `imageKind: 'label' | 'plate'` and `EntrySource: 'plate_photo'`, and `sourceForInput()` already maps plate photos correctly. The only thing stopping it today is one line in the Edge Function that rejects `imageKind: 'plate'` with a 400. The entire capture pipeline (camera/gallery picker, downscale, storage bucket + RLS, evidence upload) is already fully generic and reusable with zero logic changes — only its label-specific naming needs generalizing.

## Desired End State

The owner taps "Log a plate" on Today, photographs a meal, sees an aggregate estimate with an implied portion weight, optionally enters the plate's actual weight to rescale every macro proportionally, and commits — the entry appears on Today marked as a plate photo, with the source photo retained as evidence only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Composer affordance | Parallel "Log a plate" button | Mirrors the existing two-button layout exactly, zero risk to the shipped label-scan flow. |
| Weight-rescale mechanism | New `implied_weight_g` field on `Estimate`; multiplier = entered weight ÷ implied weight | Directly satisfies FR-004's "rescales... rather than replacing" wording, reusing the proven `total()`/multiplier pattern. |
| Rescale gating | Hide the weight field entirely when `implied_weight_g` is null | Mirrors `showServings` hiding exactly when `serving_size` is null — no new UI state. |
| Multi-item plates | Aggregate + flag via the existing `assumptions` array | Zero schema cost — `assumptions` already exists and already renders; sets honest expectations where the estimate is roughest. |
| Testing/fixtures | Wiring-only smoke; no real plate-photo fixture | Ships faster; vision-prompt quality verified manually instead. |
| Module naming | Rename `capture-label.ts`→`capture-photo.ts` etc. (source-agnostic) | The underlying logic has zero label-specific code today — cloning would duplicate ~40 proven lines for no benefit. |

## Scope

**In scope:** plate estimation prompt + schema field, capture pipeline generalization, composer button, review-screen weight rescale, smoke-test cleanup.

**Out of scope:** per-component decomposition (deferred, OQ-6), a real plate-photo test fixture, photo retention policy changes, a unified/merged capture button.

## Architecture / Approach

The Edge Function's `estimateFromImage` becomes parameterized by `imageKind` (label vs. plate) rather than duplicated — same request plumbing, different system prompt. The client-side capture modules get renamed to source-agnostic names and reused by a new composer button. `review.tsx` gets a weight-rescale mechanism structurally parallel to its existing servings-rescale mechanism, computing a ratio instead of taking a raw count.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server-side plate estimation | New prompt, `implied_weight_g` field, real dispatch | Prompt must reliably produce a plausible numeric weight |
| 2. Generalize the capture pipeline | Renamed, source-agnostic capture modules | Pure rename — low risk, but touches S-03's shipped files |
| 3. Composer affordance | "Log a plate" button | None significant — direct clone of a proven pattern |
| 4. Review-screen integration | Weight-rescale UI, `isPlatePhoto` branches | The `queryKeys.capturedPhoto` rename must move atomically across all three call sites |
| 5. Smoke + manual verification | Stale test case removed, full walkthrough | No machine-verified vision-prompt quality — manual-only by design |

**Prerequisites:** F-01, F-02, S-03 — all already shipped.
**Estimated effort:** ~3-4 sessions across 5 phases.

## Open Risks & Assumptions

- The plate-estimation prompt's accuracy (both food recognition and implied-weight judgment) is unverified by automated tests — per the testing decision, this is manual-only until a real fixture is supplied later.
- Renaming S-03's shipped capture modules touches working code; the rename is mechanical (type-checker-verified) but still carries a small blast-radius risk on a proven path.

## Success Criteria (Summary)

- A plate photo produces one aggregate estimate with an implied portion weight, never a per-component breakdown.
- Supplying an actual weight rescales every macro proportionally; leaving it blank commits the raw estimate unchanged.
- An unrecognized plate photo never fabricates a number — same manual-entry fallback as every other capture path.
