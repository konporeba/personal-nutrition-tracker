<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Label Scan Logging (S-03)

- **Plan**: context/changes/label-scan-logging/plan.md
- **Scope**: Full plan (Phases 1-4 of 4)
- **Date**: 2026-07-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unhandled rejection when a captured photo fails to downscale

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/meal-composer.tsx:47-52 (calls into src/lib/downscale-label.ts:21)
- **Detail**: `scanLabel()` awaits `captureLabel()` with no try/catch. `captureLabel` itself resolves `null` cleanly on cancel/denied-permission, but it delegates to `downscaleLabel`, which can throw — `renderAsync()`/`saveAsync()` can reject on a bad URI, and `downscale-label.ts:21` explicitly throws when `saved.base64` comes back falsy. That rejection is unhandled: the owner sees no error, `estimate.isPending` never engages, and the composer just sits there — unlike the parallel text-submit path, whose failures are caught by the mutation and surfaced via `estimate.isError`/`estimateErrorMessage`.
- **Fix**: Wrap the `captureLabel()` call in `scanLabel()` in a try/catch; on catch, surface the same error affordance the text path uses (e.g. a local error state rendered through the existing error message row) so a failed downscale doesn't fail silently.
- **Decision**: FIXED — added a `scanError` state in `meal-composer.tsx`, wrapped `captureLabel()` in try/catch, surfaced "Couldn't read that photo. Try again."

### F2 — No size limit on the label image before it reaches the Anthropic API

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Security/Performance)
- **Location**: supabase/functions/estimate/index.ts:62-80, supabase/functions/estimate/estimate.ts:216-249, src/data/meal-photos.repo.ts:10-18
- **Detail**: The client always downscales to ~1500px/q0.7 before sending, but the Edge Function is a public HTTP boundary that only checks `input.data` is a non-empty string — nothing caps its length before it's forwarded to Anthropic. An oversized payload from a direct authenticated call would incur cost/latency or a generic 502 that the client surfaces as "try again" (misleading — it isn't retriable). `uploadMealPhoto` has the same gap on the Storage-upload side, though it only ever receives the same bounded bytes from the one caller today.
- **Fix**: Reject `input.data` above a fixed base64-length threshold (e.g. ~6MB base64 ≈ 4.5MB raw) in `index.ts`'s image branch before calling `estimateFromImage`, returning `invalid_input` rather than letting an oversized request reach Anthropic.
- **Decision**: FIXED — added `MAX_IMAGE_DATA_LENGTH` (6MB) check in `index.ts`; redeployed and reverified via `npm run smoke:estimate`.

### F3 — `tsconfig.json`'s new `"types": ["node"]` is scoped to the whole app, not just Node-run scripts

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture / Scope Discipline
- **Location**: tsconfig.json:5-7
- **Detail**: This was added in Phase 4 to make `scripts/estimate-smoke.ts`'s new `node:fs`/`node:path` fixture-reading imports type-check, and isn't mentioned in the plan's "Changes Required" text for any phase (a verified, undocumented EXTRA). It's applied at the **root** tsconfig, whose `include` covers all of `src/` too — so it leaks Node's ambient globals (`process`, `Buffer`, `require`, etc.) into RN/web app-code compilation project-wide, not just the Node-run scripts that need them. A separate `scripts/tsconfig.json` already exists in the repo suggesting Node-context types were meant to be isolated there — but it's dead config: none of the five `scripts/run-*.mjs` esbuild bundlers point at it (confirmed — all five hardcode `tsconfig: 'tsconfig.json'`), so scoping the fix there instead would not actually satisfy Phase 4's own `npx tsc --noEmit` success criterion without also rewiring those bundlers.
- **Fix A ⭐ Recommended**: Keep the root-level `"types": ["node"]` as-is; a full `tsc --noEmit` pass was already verified clean with zero side effects elsewhere in the app. Add one sentence to `change.md`'s Notes documenting this as a plan amendment.
  - Strength: Already verified safe; zero additional file churn.
  - Tradeoff: Node globals remain available (in the type system only) throughout app code indefinitely.
  - Confidence: HIGH — verified via a full project `tsc --noEmit` pass.
  - Blind spot: None significant — this is a compile-time-only type leak, not a runtime one.
- **Fix B**: Properly wire `scripts/tsconfig.json` — point all five `run-*.mjs` bundlers at it, move `"types": ["node"]` there, and exclude `scripts/` from the root tsconfig's `include`.
  - Strength: Restores the apparent original intent of compartmentalizing Node types away from app code.
  - Tradeoff: Touches 6 files for a benefit that's currently theoretical (no observed breakage from the simpler fix).
  - Confidence: MEDIUM — plausible, but whether `scripts/tsconfig.json`'s existing `baseUrl`/`paths` remap is fully compatible with esbuild's `tsconfig` option hasn't been verified.
- **Decision**: DECIDED — Fix A. Kept root-level `"types": ["node"]`; documented as a plan amendment in `change.md`'s Notes section.

### F4 — Staged `estimate`/`labelPhoto` query-cache entries are never removed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance/Data safety)
- **Location**: src/app/(today)/review.tsx (save handler, around line 148); src/data/query-keys.ts:40-46; src/data/query-client.ts:13
- **Detail**: Neither `queryKeys.estimate(runId)` nor `queryKeys.labelPhoto(runId)` is ever removed from the query cache — not on a successful commit, not on abandoning review. They rely solely on the default 24h `gcTime`. Since `labelPhoto` entries embed a full base64 JPEG (~100-500KB) and are read via `getQueryData` (no active `useQuery` observer keeping them "hot" but also nothing evicting them early), the AsyncStorage/localStorage persister will keep writing them for up to 24h. Web's localStorage quota (~5-10MB) could be exhausted by several abandoned/completed scans in that window, which typically fails the persister silently and degrades the whole offline cache — not just this feature.
- **Fix**: Call `queryClient.removeQueries({ queryKey: queryKeys.estimate(runId) })` and the `labelPhoto` equivalent right after a successful commit in `review.tsx`'s `save()` `onSuccess`.
- **Decision**: FIXED — both `removeQueries` calls added in `review.tsx`'s `save()` `onSuccess`, right after the evidence-upload call.

### F5 — `mediaType` isn't validated against Anthropic's accepted image types

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: supabase/functions/estimate/index.ts:71-73
- **Detail**: `mediaType` passes straight through to Anthropic's `media_type` field with only a non-empty-string check, not validated against the accepted enum (`image/jpeg`/`png`/`gif`/`webp`). Not exploitable — Anthropic itself rejects an invalid value — just a missing input-validation layer at the boundary.
- **Fix**: Validate `input.mediaType` against an allow-list before dispatch.
- **Decision**: FIXED — added `ACCEPTED_IMAGE_MEDIA_TYPES` allow-list check in `index.ts`; redeployed and reverified via `npm run smoke:estimate`.

### F6 — A double-tap on "Scan a label" can fire two AI calls

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/meal-composer.tsx:29, 47-64
- **Detail**: `canScan` is gated only by `estimate.isPending`, which isn't set until `estimate.mutate(...)` actually runs — after the picker and `downscaleLabel` resolve. During that async gap, a second tap can fire a second picker/Alert and a second billed AI call. Low likelihood and no data corruption (a second review screen would just stack), but inconsistent with the double-submit guard already applied elsewhere (review.tsx's explicit `isSuccess` check).
- **Fix**: Track a local `isCapturing` flag scoped to the picker+downscale window and gate the button on it too, mirroring the existing pending-state pattern.
- **Decision**: FIXED — added `isCapturing` state in `meal-composer.tsx`, folded into `canScan`.

### F7 — `base64-arraybuffer`'s `decode()` never throws on malformed input

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data safety)
- **Location**: src/data/meal-photos.repo.ts:5, 13
- **Detail**: Verified against the actual `decode()` implementation — invalid base64 characters silently map to corrupted-but-valid-looking bytes rather than throwing, so `uploadMealPhoto`'s `try/catch` in review.tsx will never catch a decode-corruption case; it would just silently store garbage bytes. Low impact given photos are evidence-only and never displayed (per the file's own header comment).
- **Fix**: None recommended — the blast radius is low enough (evidence photo only, never surfaced) that added validation isn't clearly worth the complexity. Noted for awareness.
- **Decision**: SKIPPED — accepted as-is per the finding's own recommendation.
