---
date: 2026-07-26T17:11:43+02:00
researcher: porebkon
git_commit: 33e94e9477ab1ab74288c126a71e68b5ab11b46c
branch: main
repository: konporeba/personal-nutrition-tracker
topic: "S-03 label-scan-logging: photograph a nutrition label, extract values, log as label_scan"
tags: [research, codebase, estimate-edge-function, photo-capture, storage, review-commit]
status: complete
last_updated: 2026-07-26
last_updated_by: porebkon
---

# Research: S-03 label-scan-logging

**Date**: 2026-07-26T17:11:43+02:00
**Researcher**: porebkon
**Git Commit**: 33e94e9477ab1ab74288c126a71e68b5ab11b46c
**Branch**: main
**Repository**: konporeba/personal-nutrition-tracker

## Research Question

How should S-03 be built — the owner photographs a packaged-product nutrition
label (camera or gallery), the system extracts calories/protein/carbs/fat/serving
size without typing, and the entry is logged marked as a `label_scan` — reusing
S-01's estimate→review→commit flow (US-03; FR-001/002/005/006/007/008/040)?

## Summary

The groundwork for this slice is unusually complete: the estimate contract was
**deliberately built image-extensible** in F-02, and F-01 **already provisioned a
private `meal-photos` storage bucket** with owner-only RLS and a documented path
convention. What's missing is the actual wiring, which breaks into four buildable
gaps plus one already-solved piece:

1. **Capture** — no image-picker/camera dependency is installed; nothing captures a
   photo yet.
2. **Edge Function image path** — the `image` input variant is reserved in the
   contract but the handler **rejects it with `400 image_input_unsupported`**; there
   is no `estimateFromImage` (vision/OCR) yet.
3. **Source discrimination** — `sourceForInput` returns `plate_photo` for *every*
   image; S-03 needs `label_scan`, so the image input must carry a label-vs-plate
   discriminator.
4. **Data-model gap** — the `Estimate` shape has no `serving_size`, and US-03's
   "confirm the number of servings" implies per-serving values × a servings count,
   which S-01's single-aggregate estimate doesn't express.
5. **Photo retention (already solved at the infra layer)** — the `meal-photos`
   private bucket + RLS exist; S-03 only needs the upload call (OQ-7 default: retain
   as evidence).

The review/commit screen and the `estimateMeal` client seam were designed as the
shared extension points for exactly this slice ("extend, don't replace").

## Detailed Findings

### 1. The estimate contract is image-ready but stubbed off

- **Client seam** `estimateMeal(input: EstimateInput)` already accepts the image
  variant — [src/data/estimation.ts:69](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/data/estimation.ts#L69). It never throws; every failure resolves as `{ ok: false, error }` and is converted to a thrown `EstimateFailedError` in the hook.
- **Input union** `EstimateInput = TextInput | ImageInput`, where `ImageInput = { kind: 'image'; mediaType?: string; data? : string }` — [src/data/estimation-types.ts:41-44](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/data/estimation-types.ts#L41-L44) and its Deno mirror [supabase/functions/estimate/types.ts:52-55](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/functions/estimate/types.ts#L52-L55). The two copies are kept in sync by the smoke tests.
- **The handler rejects image** today: `if (input.kind === 'image') return json({ error: 'image_input_unsupported' }, 400)` — [supabase/functions/estimate/index.ts:58](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/functions/estimate/index.ts#L58). Only `estimateFromText` exists — [supabase/functions/estimate/estimate.ts:142](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/functions/estimate/estimate.ts#L142).
- **The vision call is a near-clone of the text call.** `estimateFromText` already POSTs to the Anthropic messages API with `output_config.format.json_schema` + `thinking: adaptive` — [estimate.ts:146-161](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/functions/estimate/estimate.ts#L146-L161). An `estimateFromImage` sends the same request with an image content block (`{ type: 'image', source: { type: 'base64', media_type, data } }`) plus a label-OCR system prompt, and reuses the same `ESTIMATE_SCHEMA` + `sanitize`. **The exact v57/Anthropic request shape must be confirmed against live docs before coding** (per CLAUDE.md).

### 2. Capture pipeline — nothing is wired yet

- **No capture dependency is installed** — `package.json` has none of
  `expo-image-picker`, `expo-camera`, `expo-image-manipulator`, `expo-file-system`.
- **`app.json` is minimal** — plugins are only `expo-router` + `expo-splash-screen`, and there are **no camera/photo permission strings** — [app.json:26-36](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/app.json#L26-L36). Adding a capture library means adding its config plugin + iOS/Android permission descriptions here.
- **SDK 57 note (CLAUDE.md):** this is Expo SDK 57 / RN 0.86. The likely fit is `expo-image-picker` (covers both `launchCameraAsync` and `launchImageLibraryAsync`, has a `base64` option and permission helpers), optionally with `expo-image-manipulator` to downscale before base64 (Anthropic has per-image size/token limits, and base64 travels in the request body). **Read `https://docs.expo.dev/versions/v57.0.0/` for the exact API/permission shape — do not code from memory of older SDKs.**
- **Cross-platform reality:** the app targets iOS/Android/web, but FR-040 frames this as a *mobile* camera capability. Label scan is inherently mobile; the plan should decide whether web gets a gallery-upload fallback or the capture entry point is mobile-only.

### 3. Photo storage is already provisioned (the big head start)

- F-01 created a **private `meal-photos` bucket** (`public = false`) plus an
  owner-only RLS policy on `storage.objects` scoped by `bucket_id = 'meal-photos'` —
  [supabase/migrations/20260720120200_storage.sql:11-25](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/migrations/20260720120200_storage.sql#L11-L25).
- The migration **explicitly names S-03 as the owner of upload code** and documents
  the path convention: `meal-photos/<meal_entry_id>.jpg`, "photos are evidence only
  and are NEVER surfaced as an entry's displayed image" —
  [storage.sql:1-9](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/migrations/20260720120200_storage.sql#L1-L9).
- **Implication for OQ-7 (retention):** the default "retain as evidence" is already
  the infra posture. S-03 uploads; no deletion/retention-policy code is required now.
- **Path timing:** the convention keys the object on `meal_entry_id`. Client ids are
  generated up front via `newId()` (used in `createMealEntry`), so the entry id is
  available before insert — the upload can use it. The plan must sequence
  upload-vs-commit and decide behavior if one succeeds and the other fails.

### 4. Review/commit reuse + source threading

- **The review screen is the single write point** and reads its estimate from the
  query cache by `runId` (not the URL) —
  [src/app/(today)/review.tsx:28-49](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/app/(today)/review.tsx#L28-L49). The commit payload is built at [review.tsx:84-103](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/app/(today)/review.tsx#L84-L103).
- **`source` is currently hardcoded** to `recognized ? 'free_text' : 'manual'` —
  [review.tsx:90](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/app/(today)/review.tsx#L90). For a label scan the entry must commit as `source: 'label_scan'` (the enum value already exists — [src/data/types.ts:10-16](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/data/types.ts#L10-L16)). The capture path (label vs manual-on-unrecognized) needs to travel to review — today only `runId` + `text` do.
- **The capture entry point** is the `MealComposer` (text-only) —
  [src/components/meal-composer.tsx:26-37](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/components/meal-composer.tsx#L26-L37). S-03 adds a "scan a label" affordance (a camera/gallery button) that runs capture → `estimateMeal({ kind:'image', … })` → navigate to `/review` with the runId, mirroring the text flow.
- **The estimate→run→source mapping is centralized** in `sourceForInput` —
  [supabase/functions/estimate/source.ts:7-16](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/functions/estimate/source.ts#L7-L16). It returns `plate_photo` for *all* image input, with a comment that the branch is unreachable today. **S-03 must make this return `label_scan` for a label capture** — which requires the input to distinguish label from plate (see Open Questions).

### 5. Data-model gap: serving size and the servings math

- **`Estimate` has no `serving_size`** — it is a single aggregate
  (`calories/protein_g/carbs_g/fat_g/name/food_category/assumptions/recognized/confidence`)
  — [estimation-types.ts:17-31](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/data/estimation-types.ts#L17-L31). FR-002 requires extracting **serving size**, and US-03 says the owner **confirms the number of servings or total weight**.
- This implies the label flow is not a single aggregate: the label yields **per-serving** values + a serving size, and the logged total is `per-serving × servings`. Two plausible shapes for the plan to choose:
  - **(a) Extend the estimate**: add `serving_size` (+ maybe per-serving macro semantics) to the schema (both Deno + client copies), have review show a "servings" input that multiplies before commit.
  - **(b) Keep the aggregate**: prompt the model to return totals for an assumed 1 serving and surface the serving size in `assumptions`; the owner edits the numbers at review (less "no typing", weaker on FR-002).
- **`meal_entries` has no serving columns** — [types.ts:19-37](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/src/data/types.ts#L19-L37); storing serving size/count would be an additive migration (or it stays review-only and only the computed totals are persisted).

### 6. estimation_runs audit for an image run

- The handler records a run for every AI call via `recordEstimationRun`, with
  `input_summary: input.text.slice(0, 200)` — [index.ts:75-83](https://github.com/konporeba/personal-nutrition-tracker/blob/33e94e9477ab1ab74288c126a71e68b5ab11b46c/supabase/functions/estimate/index.ts#L75-L83). For an image there is no text; the plan needs a summary substitute (e.g., a fixed `"label scan"` marker or an OCR'd product name). `raw_result` stores the model output verbatim as today.

## Code References

- `src/data/estimation.ts:69-86` — `estimateMeal`; already accepts `EstimateInput`, never throws.
- `src/data/estimation-types.ts:41-44` — reserved `ImageInput` variant (client copy).
- `src/data/use-estimate.ts:48-63` — `useEstimateMeal`; mutationFn hardcodes `{ kind:'text' }` and stages the estimate under `queryKeys.estimate(runId)`.
- `src/components/meal-composer.tsx` — text-only capture entry point; the model for a scan entry point.
- `src/app/(today)/review.tsx:84-103` — the single commit; `source` hardcoded at :90.
- `supabase/functions/estimate/index.ts:58` — image rejected; `:63-69` text dispatch; `:75-83` run recording.
- `supabase/functions/estimate/estimate.ts:142-177` — `estimateFromText` (the vision-call template).
- `supabase/functions/estimate/source.ts:7-16` — `sourceForInput`; returns `plate_photo` for image.
- `supabase/migrations/20260720120200_storage.sql` — `meal-photos` private bucket + RLS + path convention.
- `src/data/meal-entries.repo.ts:21-39` — `createMealEntry`; client-generated `id` via `newId()` (available for the photo path).
- `src/data/types.ts:10-16` — `EntrySource` includes `label_scan`.

## Architecture Insights

- **The seams are intentional extension points.** F-02's plan states the contract
  "S-01, S-03, and S-04 all reuse", with `image` reserved and `sourceForInput`
  centralized "so later slices extend one place". S-03 is the first exercise of that
  design — the right instinct is to *extend* `ImageInput`, `sourceForInput`, and the
  handler dispatch, and to *reuse* review/commit, rather than build a parallel path.
- **Vision = text call + an image content block.** The Anthropic request, structured
  output schema, `sanitize` (never-fabricate, FR-008), and run recording are all
  reusable; only the content block and system prompt differ. Keep the never-fabricate
  invariant: an unreadable label is `recognized: false`, which review already turns
  into the manual form.
- **Two-step review** is the likely UX for servings: capture → estimate (per-serving)
  → review shows extracted values + a servings input → commit stores the product.
  This keeps FR-005 (nothing logged until confirmed) and FR-008 (no fabricated
  numbers) intact.
- **Privacy model is done.** Evidence photos live in a private bucket, never shown as
  the entry image; the icon (S-05) is the entry's only visual. Upload is the only new
  storage code.

## Historical Context (from prior changes)

- `context/archive/2026-07-22-ai-estimation-proxy/plan.md:61,77-78,147,261` — the
  contract was built "text-first, image-extensible"; `image` reserved and returns
  "unsupported" until S-03/S-04; `sourceForInput` centralizes `image → label_scan /
  plate_photo` for later slices.
- `context/archive/2026-07-20-synced-data-backbone/` — F-01 provisioned the
  `meal-photos` bucket as "private photo-storage groundwork (FR-007)", explicitly
  deferring upload to S-03.
- `context/archive/2026-07-24-free-text-meal-logging/` (S-01) — the review→commit
  flow, the `sectionForTime` bucketing, and the "typed text seeds the manual name"
  pattern this slice reuses.
- S-05 (just shipped) added `food_category` to `meal_entries` and the icon path; a
  label-scan entry will carry a `food_category` from the vision estimate and get an
  icon for free.

## Related Research

- No prior `research.md` for a photo/capture slice. Nearest prior art is the F-02
  proxy plan (image-variant reservation) and the F-01 storage migration, both cited
  above.

## Open Questions

These are the decisions `/10x-plan` must resolve (the research surfaces options, not
a choice):

1. **Label-vs-plate discrimination.** `sourceForInput` returns `plate_photo` for all
   image input. How does a label capture signal `label_scan`? Options: add a
   discriminator to `ImageInput` (e.g. `imageKind: 'label' | 'plate'` or split into
   `kind: 'label' | 'plate'`); or pass the intended source alongside the input.
   Affects both contract copies + `sourceForInput` + the smoke.
2. **Serving-size model (the crux).** Extend `Estimate`/schema with `serving_size`
   and per-serving semantics + a review "servings" multiplier (stronger on FR-002/
   US-03), or keep the aggregate and surface serving size via assumptions (simpler,
   weaker). Does anything persist to `meal_entries` (serving columns) or only the
   computed totals?
3. **Capture library + downscale.** Confirm `expo-image-picker` (camera + gallery,
   base64) for SDK 57 and whether `expo-image-manipulator` is needed to downscale
   before the vision call; add the config plugin + permission strings to `app.json`.
4. **Upload sequencing.** Upload to `meal-photos/<meal_entry_id>.jpg` before or after
   commit; the entry id is client-generated so either order works — decide the
   failure semantics (orphan photo vs entry with no evidence).
5. **Web behavior.** Mobile-only capture, or a web gallery-upload fallback? FR-040
   frames camera as mobile.
6. **`input_summary` for image runs.** A fixed `"label scan"` marker vs the OCR'd
   product name.
7. **OQ-7 retention.** Default retain-indefinitely is assumed (infra already private);
   confirm no deletion path ships in S-03.
