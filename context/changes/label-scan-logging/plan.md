# Label Scan Logging (S-03) Implementation Plan

## Overview

Wire the reserved image capture path end-to-end so the owner can photograph a
packaged-product nutrition label, get calories/protein/carbs/fat **and serving
size** extracted by the vision model, confirm the number of servings, and log the
entry marked `source: 'label_scan'` — without typing any numbers (US-03;
FR-001/002/005/006/007/008/040).

The slice **extends the intentional seams** F-02 and F-01 left open rather than
building a parallel path: the `image` variant on the estimate contract, the
centralized `sourceForInput` mapping, the shared review/commit screen, and the
already-provisioned private `meal-photos` bucket.

## Current State Analysis

The groundwork is unusually complete (see
`context/changes/label-scan-logging/research.md`):

- **The estimate contract is image-ready but stubbed.** `ImageInput = { kind:'image'; mediaType?; data? }` exists in both copies (`src/data/estimation-types.ts:41`, Deno `supabase/functions/estimate/types.ts:52`) and the client seam `estimateMeal` already accepts it (`src/data/estimation.ts:69`), but the handler rejects image with `400 image_input_unsupported` (`supabase/functions/estimate/index.ts:58`). Only `estimateFromText` exists (`supabase/functions/estimate/estimate.ts:142`).
- **`sourceForInput` returns `plate_photo` for all image input** (`supabase/functions/estimate/source.ts:14`), with a comment that the branch is unreachable today. It must distinguish label from plate.
- **`Estimate` has no `serving_size`** (`estimation-types.ts:17`) — it is a single aggregate. US-03 requires extracting a serving size and confirming a servings count.
- **The review screen is the single write point** and hardcodes `source: recognized ? 'free_text' : 'manual'` (`src/app/(today)/review.tsx:90`). Only `runId` + `text` travel to it today.
- **Photo storage is provisioned:** a private `meal-photos` bucket + owner RLS exist (`supabase/migrations/20260720120200_storage.sql`), path convention `meal-photos/<meal_entry_id>.jpg`, S-03 named as the owner of the upload code. Client ids are generated up front via `newId()` (`src/data/meal-entries.repo.ts:23`), so the entry id is available before insert.
- **No capture dependency is installed** and `app.json` has no camera/photo permission strings.
- **The run recorder** stores `input_summary: input.text.slice(0, 200)` (`index.ts:77`); an image run has no text.

## Desired End State

On a phone, a "Scan a label" affordance on the Today composer opens the camera or
gallery. The captured photo is downscaled, sent to the vision proxy, and comes back
as a per-serving estimate carrying a `serving_size` string. The review screen shows
the extracted per-serving values plus a **servings** input (default 1); on save the
totals are `per-serving × servings` and the entry is written with
`source: 'label_scan'` and its `food_category` icon (S-05). The label photo is
uploaded to `meal-photos/<entry_id>.jpg` as evidence (never displayed). An unreadable
label comes back `recognized: false` and review turns it into the manual form
(FR-008 — never a fabricated number). On web, the same flow runs via a gallery/file
upload (no camera).

**Verify:** `npm run smoke:estimate` passes with the image path exercised (image
accepted, `label_scan` source recorded, `serving_size` present on a real label,
null macros on an unreadable one); `npm run lint` and `tsc` pass; a manual
device run logs a real product from a photo with the correct multiplied totals and
an uploaded evidence photo.

### Key Discoveries:

- Vision call = text call + an image content block. `estimateFromText` already POSTs to the Anthropic messages API with `output_config.format.json_schema` + `thinking: { type: 'adaptive' }` and `sanitize` (`estimate.ts:146-161`). `estimateFromImage` sends the same request with `messages: [{ role:'user', content: [ { type:'image', source:{ type:'base64', media_type, data } }, { type:'text', text: <label-OCR instruction> } ] }]`, reusing `ESTIMATE_SCHEMA` + `sanitize`. Model `claude-opus-4-8` supports vision; a full-res label can cost up to ~4784 image tokens (2576px long edge), so downscale before base64.
- SDK 57 capture (confirmed against `docs.expo.dev/versions/v57.0.0/`): `expo-image-picker` config plugin `"expo-image-picker"` with `photosPermission`/`cameraPermission` iOS strings; `launchCameraAsync`/`launchImageLibraryAsync({ base64:true, mediaTypes:['images'], quality })` → `{ canceled, assets:[{ uri, base64, mimeType }] }`; permission helpers `requestCameraPermissionsAsync`/`requestMediaLibraryPermissionsAsync`. `expo-image-manipulator` needs no config plugin; imperative `ImageManipulator.manipulate(uri).resize({ width, height:null }).renderAsync()` → `saveAsync({ format: SaveFormat.JPEG, compress, base64:true })`. The `useImageManipulator` hook cannot be called inside a press handler — use the non-hook `manipulate` context.
- The two contract copies (Deno + client) are kept in sync by `scripts/estimate-smoke.ts`, which exercises the real wire shape. Change one side, change the other, update the smoke.
- Client ids come from `newId()` up front, so the evidence upload can key on the entry id and run **after** a successful commit.

## What We're NOT Doing

- **No plate-photo path (S-04).** Only `imageKind:'label'` is wired; `imageKind:'plate'` stays a reserved branch (S-04 is blocked on OQ-6).
- **No barcode lookup (OQ-3).** Confirmed PRD non-goal — products are identified from the photographed label only.
- **No photo deletion / retention policy (OQ-7).** Infra defaults to retain-as-evidence (private bucket); no deletion code ships.
- **No entry detail view / photo display.** FR-007: the photo is evidence only, never the entry's displayed image (the S-05 icon is the visual).
- **No web camera.** Web gets a gallery/file upload fallback only (FR-040 frames camera as mobile).
- **No new `meal_entries` serving columns.** Only the computed totals persist; `serving_size` and the servings count live in the estimate/review, not on the row.

## Implementation Approach

Extend the existing seams in dependency order: the server contract first (so the
image path is verifiable via the smoke/curl before any UI exists), then the capture
pipeline that feeds it, then the review/commit changes plus the evidence upload,
then verification. The never-fabricate invariant (FR-008) is preserved throughout —
an unreadable label is `recognized: false`, which the review screen already turns
into the manual form.

## Critical Implementation Details

- **Serving-size semantics are the crux.** The label estimate is **per serving**: the vision prompt returns `calories/protein_g/carbs_g/fat_g` for a single serving plus a `serving_size` string (e.g. "30 g", "1 cup (240 ml)"). The logged total is `per-serving × servings`, where `servings` is the count the owner confirms at review (default 1). Only the multiplied totals persist to `meal_entries`; `serving_size` and the servings count are review-time only. `serving_size` is added to the `Estimate` shape (both copies) and `ESTIMATE_SCHEMA`, and must be nullable (an unreadable or serving-less label yields `null`, never a fabricated size).
- **Upload runs after commit, best-effort.** Insert the `meal_entry` first (id from `newId()`), then upload to `meal-photos/<id>.jpg`; an upload failure is logged and swallowed, never surfaced as a failed log. The photo is evidence-only and never displayed, so a missing one is harmless — the log succeeding is the product's core promise.
- **Downscale before the vision call.** Base64 travels in the request body and Anthropic has per-image token limits; downscale to a long-edge width (~1500px) as JPEG before encoding. Reuse the same downscaled JPEG bytes for both the estimate call and the evidence upload so the stored photo matches what the model saw.

## Phase 1: Server & Contract (vision estimate)

### Overview

Make the estimate proxy accept a label image, extract a per-serving estimate with a
serving size, record the run, and map the source to `label_scan` — all verifiable
server-side before any UI exists.

### Changes Required:

#### 1. Contract: image discriminator + serving size (both copies)

**File**: `src/data/estimation-types.ts`, `supabase/functions/estimate/types.ts`

**Intent**: Add the label-vs-plate discriminator to the image variant and a nullable serving size to the estimate, keeping the two copies byte-identical in shape.

**Contract**: `ImageInput` becomes `{ kind:'image'; imageKind:'label'|'plate'; mediaType?: string; data?: string }`. `Estimate` gains `serving_size: string | null` (documented as per-serving semantics: macro fields are for **one** serving). Both files change identically.

#### 2. Estimate schema + vision prompt

**File**: `supabase/functions/estimate/estimate.ts`

**Intent**: Add `estimateFromImage` as a near-clone of `estimateFromText` — same Anthropic request, structured-output schema, and `sanitize`, differing only in the content block and a label-OCR system prompt that instructs per-serving extraction. Add `serving_size` to `ESTIMATE_SCHEMA` and carry it through `sanitize` (null on the unrecognized path, and null when no serving size is legible).

**Contract**: `estimateFromImage(mediaType: string, data: string): Promise<EstimateResult>`. The request body matches `estimateFromText` (model `claude-opus-4-8`, `max_tokens`, `thinking:{type:'adaptive'}`, `output_config.format.json_schema`), with `messages: [{ role:'user', content: [ { type:'image', source:{ type:'base64', media_type: mediaType, data } }, { type:'text', text: LABEL_PROMPT } ] }]`. `ESTIMATE_SCHEMA.properties.serving_size = { type: ['string','null'] }` and is added to `required`. A new `LABEL_SYSTEM_PROMPT` instructs: read the printed label, return **per-serving** macros + `serving_size`; if the image is not a readable nutrition label, set `recognized:false` and every macro + `serving_size` to null; never fabricate.

#### 3. Handler dispatch + source + run summary

**File**: `supabase/functions/estimate/index.ts`, `supabase/functions/estimate/source.ts`

**Intent**: Accept image input, validate it, dispatch to `estimateFromImage`, and record the run with a text-free summary. Map `imageKind` to the entry source.

**Contract**: In `index.ts`, replace the `image_input_unsupported` rejection with validation (`imageKind` is `'label'|'plate'`, `data` is a non-empty base64 string, `mediaType` present) then `estimateFromImage(input.mediaType, input.data)`. `input_summary` for an image run = `result.estimate.name` (the OCR'd product name) if non-empty, else the literal `'label scan'`. In `source.ts`, `sourceForInput` returns `label_scan` for `imageKind:'label'` and `plate_photo` for `imageKind:'plate'`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Function deploys cleanly (Supabase deploy of `estimate`)

#### Manual Verification:

- A curl/console call to the deployed function with a real label image returns `recognized:true`, per-serving macros, and a non-null `serving_size`; the recorded run has `source:'label_scan'` and an `input_summary`.
- The same call with a non-label image returns `recognized:false` with null macros and null `serving_size` (FR-008).

**Implementation Note**: After Phase 1 automated verification passes, pause for manual confirmation (a real label extracts correctly; a non-label does not fabricate) before Phase 2.

---

## Phase 2: Capture Pipeline

### Overview

Install the capture libraries, declare permissions, and add the "scan a label"
entry point that turns a photo into an `estimateMeal({ kind:'image', imageKind:'label', … })`
call and navigates to review — mirroring the text flow, with a web gallery fallback.

### Changes Required:

#### 1. Dependencies + config

**File**: `package.json`, `app.json`

**Intent**: Add the capture libraries and their native config so the app can request camera/photo access on iOS/Android. Install exact SDK-57-compatible versions via `npx expo install`.

**Contract**: Add `expo-image-picker` and `expo-image-manipulator`. In `app.json`, add the `expo-image-picker` config plugin with `photosPermission` and `cameraPermission` strings (per CLAUDE.md, confirm exact prop names against the v57 docs before writing). `expo-image-manipulator` needs no plugin.

#### 2. Capture + downscale helper (platform-split)

**File**: `src/lib/capture-label.ts` (+ `.web.ts`)

**Intent**: A single helper that acquires a label photo, downscales it to a JPEG, and returns the base64 + media type ready for `estimateMeal`. Native offers camera + gallery; web offers gallery/file upload only.

**Contract**: `captureLabel(): Promise<{ data: string; mediaType: string } | null>` (null = user canceled). Native: request the permission, `launchCameraAsync`/`launchImageLibraryAsync({ mediaTypes:['images'], quality })`, then `ImageManipulator.manipulate(uri).resize({ width: ~1500, height: null }).renderAsync()` → `saveAsync({ format: SaveFormat.JPEG, compress: ~0.7, base64: true })`. Returns `{ data: base64, mediaType: 'image/jpeg' }`. Web (`.web.ts`): `launchImageLibraryAsync` (or a file input) → same manipulate/downscale path; no camera branch. The returned base64 bytes are reused by the review-time upload (Phase 3) so the stored photo matches what the model saw.

#### 3. React seam for image estimates

**File**: `src/data/use-estimate.ts`

**Intent**: Let the estimate hook accept an image input, not just text — today `mutationFn` hardcodes `{ kind:'text' }`. Keep the never-throws → thrown-error conversion and the run-id staging unchanged.

**Contract**: Widen `useEstimateMeal`'s `mutationFn` to take an `EstimateInput` (or add an image-specific entry point) so callers can pass `{ kind:'image', imageKind:'label', mediaType, data }`. `onSuccess` still stages the estimate under `queryKeys.estimate(runId)`.

#### 4. Scan affordance on the composer

**File**: `src/components/meal-composer.tsx`

**Intent**: Add a "Scan a label" button beside the text input that runs capture → estimate → navigate, reusing the composer's pending/error affordances and the "never lose input" discipline.

**Contract**: On press: `captureLabel()`; if non-null, `estimate.mutate({ kind:'image', imageKind:'label', … })`; `onSuccess` navigates `router.push({ pathname:'/review', params:{ runId, source:'label_scan' } })` (see Phase 3 for the review param). Show the existing `Estimating…` state during the call and the same error message on failure. The image bytes captured here are handed to the review upload (Phase 3) — carry them via the query cache keyed on `runId` (not the URL).

### Success Criteria:

#### Automated Verification:

- Dependencies install and resolve: `npx expo install --check`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- On a device, "Scan a label" opens the camera and the gallery; picking/taking a photo shows `Estimating…` and lands on the review screen.
- On web, "Scan a label" opens a gallery/file picker (no camera) and reaches review.
- Canceling the picker leaves the composer untouched (no spurious estimate, no lost text).

**Implementation Note**: After Phase 2 automated verification passes, pause for manual confirmation (capture works on a device and on web, cancel is clean) before Phase 3.

---

## Phase 3: Review, Servings & Evidence Upload

### Overview

Thread the label source into review, add the servings multiplier and serving-size
display, commit as `label_scan`, and upload the evidence photo best-effort after a
successful commit.

### Changes Required:

#### 1. Source threading + servings multiplier at review

**File**: `src/app/(today)/review.tsx`

**Intent**: Carry the capture source to review, show the extracted `serving_size` and a servings input, and commit multiplied totals with the right source — without breaking the existing text/manual modes.

**Contract**: Read an optional `source` param (`'label_scan'`) alongside `runId`. When the estimate carries a `serving_size` (label path) and is recognized, render a read-only serving-size line and a numeric **servings** input defaulting to `1`; the four macro fields display per-serving values, and the committed `calories/protein_g/carbs_g/fat_g` = per-serving × servings (computed at save, using the same numeric-guarding as the manual fields). The commit `source` is `label_scan` when recognized (the param), falling back to `manual` when the owner filled in an unrecognized label by hand (mirroring the existing FR-006 rule at `review.tsx:90`). `food_category` and `estimation_run_id` thread through as today. An unrecognized label shows no servings input (there are no per-serving numbers) and uses the manual form unchanged.

#### 2. Evidence upload after commit

**File**: `src/data/meal-photos.repo.ts` (new), wired from `review.tsx`

**Intent**: Add the one piece of new storage code S-03 owns — upload the captured label JPEG to the private bucket keyed on the entry id, best-effort, after the entry is committed.

**Contract**: `uploadMealPhoto(mealEntryId: string, data: string /* base64 jpeg */): Promise<void>` in a repo seam over `supabase.storage.from('meal-photos').upload('<mealEntryId>.jpg', …, { contentType:'image/jpeg', upsert:true })`. Called from review's `create.mutate` `onSuccess` **after** the insert resolves, using the captured bytes staged in Phase 2; any error is caught and logged, never surfaced to the owner or blocking navigation. The base64 is decoded to the byte payload supabase-storage expects (confirm the RN/web upload shape against `@/lib/supabase`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Logging a single-serving product writes the per-serving totals; setting servings to N multiplies calories and all macros by N before saving.
- The committed entry has `source: 'label_scan'` and shows its S-05 icon on Today.
- An unreadable label lands on the manual form (no servings input) and logs as `manual` with typed values.
- After a successful log, `meal-photos/<entry_id>.jpg` exists in the private bucket; a simulated upload failure still logs the entry (no user-facing error).

**Implementation Note**: After Phase 3 automated verification passes, pause for manual confirmation (multiplier math, source marker, evidence upload, and the unreadable-label fallback) before Phase 4.

---

## Phase 4: Verification (smoke + parity)

### Overview

Extend the estimate smoke to exercise the real image wire shape end-to-end and
confirm the two contract copies stay honest, then run the full automated gate and a
final manual device pass.

### Changes Required:

#### 1. Image path in the estimate smoke

**File**: `scripts/estimate-smoke.ts`

**Intent**: Replace the current "image variant is rejected" assertion (which sends `data:'not-an-image'` and expects a 400) with real image-path coverage now that image is supported, keeping the two contract copies in sync.

**Contract**: Drive `estimateMeal({ kind:'image', imageKind:'label', mediaType:'image/jpeg', data: <tiny base64 jpeg fixture> })`. Assert: a readable label fixture returns `ok`, `recognized:true`, per-serving macros, a non-null `serving_size`, and a recorded run whose `source === 'label_scan'`; an unreadable fixture returns `recognized:false` with null macros and null `serving_size` (FR-008). Clean up created runs as the script already does. (If a reliable label fixture is impractical in CI, at minimum assert the wire shape is accepted and `source:'label_scan'` is recorded, and cover the never-fabricate case with a non-label fixture.)

### Success Criteria:

#### Automated Verification:

- Estimate smoke passes: `npm run smoke:estimate`
- Full smoke passes: `npm run smoke`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- End-to-end on a device: photograph a real product label → review shows extracted values + serving size → confirm servings → the entry logs with correct totals, `label_scan` source, an S-05 icon, and an uploaded evidence photo.
- Web: the same via gallery upload (no camera).

**Implementation Note**: After Phase 4, the slice is complete. Confirm the manual end-to-end pass on both a device and web before closing the change.

---

## Testing Strategy

### Unit / contract:

- The estimate smoke (`scripts/estimate-smoke.ts`) is the contract test — it exercises the real wire shape and keeps the Deno + client copies in sync (per the F-02 pattern). Extend it for `serving_size`, `imageKind`, and `label_scan`.

### Integration:

- End-to-end capture → estimate → review → commit → upload, driven manually on a device (camera path) and on web (gallery path), since there is no configured RN test runner and camera/storage need a real environment.

### Manual Testing Steps:

1. Photograph a multi-serving packaged product; confirm per-serving values + serving size at review; set servings to the number eaten; verify multiplied totals on Today.
2. Photograph something that is not a label; confirm the manual form appears and nothing is fabricated.
3. Confirm `meal-photos/<entry_id>.jpg` exists after a successful log and is not displayed anywhere in the UI.
4. On web, log a label via gallery upload; confirm no camera affordance is shown.
5. Cancel the picker mid-capture; confirm no estimate is spent and the composer is unchanged.

## Performance Considerations

- Downscaling before the vision call bounds request size and image-token cost (full-res labels can reach ~4784 image tokens on Opus 4.8). A ~1500px long-edge JPEG at ~0.7 compression keeps labels legible while small.
- The evidence upload runs after commit and off the critical path, so it never adds latency to the log.

## Migration Notes

- No schema migration: `serving_size` and the servings count are estimate/review-only; only the computed totals persist to the existing `meal_entries` columns. The `meal-photos` bucket + RLS already exist (F-01).

## References

- Research: `context/changes/label-scan-logging/research.md`
- Contract seam (image variant): `src/data/estimation-types.ts:41`, `supabase/functions/estimate/types.ts:52`
- Vision-call template: `supabase/functions/estimate/estimate.ts:142-177`
- Source mapping: `supabase/functions/estimate/source.ts:7-16`
- Single write point: `src/app/(today)/review.tsx:84-103`
- Storage groundwork: `supabase/migrations/20260720120200_storage.sql`
- Client ids: `src/data/meal-entries.repo.ts:21-39`
- Prior art: `context/archive/2026-07-22-ai-estimation-proxy/` (contract), `context/archive/2026-07-24-free-text-meal-logging/` (review flow)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server & Contract (vision estimate)

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit` — e04e0db
- [x] 1.2 Linting passes: `npm run lint` — e04e0db
- [x] 1.3 Function deploys cleanly (Supabase deploy of `estimate`) — e04e0db

#### Manual

- [x] 1.4 Real label returns recognized per-serving macros + non-null serving_size; run recorded as `label_scan` — e04e0db
- [x] 1.5 Non-label returns recognized:false with null macros and null serving_size (FR-008) — e04e0db

### Phase 2: Capture Pipeline

#### Automated

- [x] 2.1 Dependencies install and resolve: `npx expo install --check` — b85ac64
- [x] 2.2 Type checking passes: `npx tsc --noEmit` — b85ac64
- [x] 2.3 Linting passes: `npm run lint` — b85ac64

#### Manual

- [x] 2.4 Device: "Scan a label" opens camera and gallery; capture reaches review — b85ac64
- [x] 2.5 Web: "Scan a label" opens gallery/file picker (no camera) and reaches review — b85ac64
- [x] 2.6 Canceling the picker leaves the composer untouched — b85ac64

### Phase 3: Review, Servings & Evidence Upload

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — 36933ac
- [x] 3.2 Linting passes: `npm run lint` — 36933ac

#### Manual

- [x] 3.3 Servings multiplier scales calories + all macros by N before saving — 36933ac
- [x] 3.4 Committed entry has source `label_scan` and shows its S-05 icon — 36933ac
- [x] 3.5 Unreadable label uses the manual form and logs as `manual` — 36933ac
- [x] 3.6 Evidence photo uploaded after commit; a simulated upload failure still logs the entry — 36933ac

### Phase 4: Verification (smoke + parity)

#### Automated

- [x] 4.1 Estimate smoke passes: `npm run smoke:estimate`
- [x] 4.2 Full smoke passes: `npm run smoke`
- [x] 4.3 Type checking passes: `npx tsc --noEmit`
- [x] 4.4 Linting passes: `npm run lint`

#### Manual

- [x] 4.5 Device end-to-end: photo → review → confirm servings → logged with totals, `label_scan`, icon, evidence photo
- [x] 4.6 Web end-to-end via gallery upload (no camera)
