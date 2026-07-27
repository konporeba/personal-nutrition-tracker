# Label Scan Logging (S-03) — Plan Brief

> Full plan: `context/changes/label-scan-logging/plan.md`
> Research: `context/changes/label-scan-logging/research.md`

## What & Why

Let the owner log a packaged product by photographing its nutrition label: the
vision model extracts calories/protein/carbs/fat **and serving size**, the owner
confirms how many servings they ate, and the entry is logged as a `label_scan` —
without typing any numbers (US-03; FR-001/002/005/006/007/008/040). This is the
first exercise of the image-capture path F-02 reserved and the first use of the
`meal-photos` bucket F-01 provisioned.

## Starting Point

The estimate contract already reserves an `image` variant (rejected `400` today),
`sourceForInput` already centralizes the source mapping (returns `plate_photo` for
all images), the review/commit screen is the single write point (source hardcoded
to `free_text`/`manual`), and the private `meal-photos` bucket + RLS exist with a
documented `<entry_id>.jpg` path convention. Missing: the vision call, a capture
library, a serving-size field, label-vs-plate discrimination, and the upload call.

## Desired End State

"Scan a label" on the Today composer opens the camera or gallery; the downscaled
photo returns a per-serving estimate with a serving size; review shows those values
plus a servings input (default 1) that multiplies before commit; the entry logs as
`label_scan` with its S-05 icon; the label photo is uploaded to `meal-photos/` as
evidence (never displayed). An unreadable label becomes the manual form — never a
fabricated number. Web uses a gallery upload instead of the camera.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Serving-size model | Per-serving estimate + servings multiplier at review; only totals persist | Strongest on FR-002/US-03 "no typing" — owner confirms a count, not numbers | Plan |
| Label vs plate | Add `imageKind:'label'|'plate'` to `ImageInput`; `sourceForInput` switches on it | One additive field keeps the single image dispatch and lets S-04 reuse it | Plan |
| Web behavior | Mobile camera+gallery; web gallery/file fallback (no camera) | The estimate path is platform-agnostic, so web costs little and stays testable | Plan |
| Upload sequencing | Commit entry first, upload photo after, best-effort | The log always succeeds; an evidence-only photo missing is harmless | Plan |
| Capture library | `expo-image-picker` + `expo-image-manipulator` (downscale to JPEG base64) | First-party SDK-57 libs; downscaling bounds vision token cost | Plan |
| `input_summary` for image runs | OCR'd product name, fallback `'label scan'` | Keeps the audit table human-scannable like text runs | Plan |
| Persistence | No new `meal_entries` columns | US-03 needs the logged values, not the raw label data; avoids a migration | Plan |

## Scope

**In scope:** vision estimate for labels; `imageKind` discriminator + `serving_size`
on both contract copies; camera/gallery capture (mobile) + web gallery fallback;
downscale-before-send; review servings multiplier; commit as `label_scan`;
best-effort evidence upload; smoke coverage.

**Out of scope:** plate-photo path (S-04, blocked on OQ-6); barcode lookup (OQ-3);
photo deletion/retention policy (OQ-7); any photo-detail view; web camera; new
`meal_entries` serving columns.

## Architecture / Approach

Extend the existing seams in dependency order. **Server first:** add
`estimateFromImage` (the text call + an image content block + a label-OCR prompt,
reusing the schema/`sanitize`/run-recording), accept image in the handler, map
`imageKind:'label'` → `label_scan`. **Capture:** a platform-split `captureLabel`
helper (pick → downscale → base64) feeding `estimateMeal({ kind:'image', … })` from
a composer affordance. **Review:** thread the source, show serving size + a servings
multiplier, commit multiplied totals, then upload the label to `meal-photos/`.
**Verify:** extend the estimate smoke for the image wire shape.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server & contract | Vision estimate for labels, per-serving + serving_size, `label_scan` source | Exact Anthropic vision request shape (confirmed against live docs) |
| 2. Capture pipeline | Deps + permissions + capture helper + scan affordance (mobile & web) | SDK-57 picker/manipulator API + app.json config plugins |
| 3. Review, servings & upload | Servings multiplier, `label_scan` commit, best-effort evidence upload | Multiplier math correctness; RN/web storage upload shape |
| 4. Verification | Image path in the estimate smoke + full gate | A reliable label fixture in CI |

**Prerequisites:** F-01 (storage bucket + client), F-02 (estimate proxy + contract),
S-01 (review/commit flow) — all shipped. A device for camera testing.
**Estimated effort:** ~3–4 sessions across the four phases.

## Open Risks & Assumptions

- The Anthropic vision request shape and the SDK-57 picker/manipulator APIs were confirmed against live docs; still re-verify exact prop names in `app.json` before writing native config (per CLAUDE.md).
- A CI-friendly label fixture may be hard to make deterministic; the smoke may fall back to asserting the accepted wire shape + `label_scan` source plus a never-fabricate case.
- Assumes Opus 4.8 reads printed labels reliably enough for per-serving extraction; unreadable labels are caught by `recognized:false` → manual form.

## Success Criteria (Summary)

- Photographing a real label logs the correct multiplied totals as `label_scan`, with an S-05 icon and an uploaded evidence photo, without typing numbers.
- An unreadable label never fabricates a value — it becomes the manual form (FR-008).
- `npm run smoke:estimate` / `npm run smoke`, `tsc`, and `npm run lint` all pass; web works via gallery upload with no camera.
