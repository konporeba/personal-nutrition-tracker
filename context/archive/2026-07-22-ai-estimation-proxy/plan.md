# Server-side AI Estimation Proxy (F-02) Implementation Plan

## Overview

Stand up a thin **Supabase Edge Function** (`estimate`) that is the single server-side
entry point for AI meal estimation. It holds the AI provider key off-device, accepts a
**text-first, image-extensible** estimation input, calls **Claude Opus 4.8** with
**structured outputs**, records an immutable `EstimationRun`, and returns a parsed,
review-ready estimate. The client invokes it through a typed seam and never sees the key.

This is foundation slice F-02 — the last prerequisite for the S-01 north star
(free-text meal logging). It ships no feature UI; it ships the estimate-and-record
contract that S-01, S-03, and S-04 all reuse.

## Current State Analysis

- **Data layer is ready (F-01, archived).** `public.estimation_runs` exists with
  `source` (`entry_source` enum), `input_summary text`, `raw_result jsonb`,
  `owner_id` + `created_at`, and RLS scoping every row to `owner_id = auth.uid()`.
  A matching repo seam `src/data/estimation-runs.repo.ts` → `createEstimationRun()`
  already exists; its header comment states it exists "so F-02's AI estimation proxy
  can write into it without a schema change." **F-02 needs no migration.**
- **Supabase client is platform-split** (`src/lib/supabase.ts` native /
  `src/lib/supabase.web.ts` web), always imported as `@/lib/supabase`, configured with
  `persistSession` so an owner JWT is available to attach to function calls.
- **Cloud project** `hkelauazmbqnyohjbjtw` is `ACTIVE_HEALTHY`, managed via the Supabase
  MCP (no local Docker stack). `supabase/config.toml` is minimal; migrations were applied
  via MCP `apply_migration`. There is **no `supabase/functions/` directory yet** — this
  slice creates the first Edge Function.
- **No AI provider is wired** anywhere in `src/`, `supabase/`, or `scripts/` (verified by
  grep). This is a from-scratch integration.
- **Verification pattern is established:** F-01 verifies at the data layer with an
  esbuild-bundled Node script (`scripts/run-smoke.mjs` → `scripts/smoke-store.ts`,
  `npm run smoke`) that imports the real repo/client and drives the live store. F-02
  follows the same shape rather than requiring a device.
- **Env split is fixed:** public build-time values are `EXPO_PUBLIC_*` in `.env`
  (committed, inlined into the bundle); secrets live in git-ignored `.env.local`
  (`OWNER_EMAIL`/`OWNER_PASSWORD`) for Node scripts. The AI key must be **neither** — it
  lives only in Supabase's function secret store.

### Key Discoveries:

- `src/data/estimation-runs.repo.ts:15` — `createEstimationRun(input: NewEstimationRun)`
  already inserts `source` / `input_summary` / `raw_result` under the owner session.
  The Edge Function records the run **server-side** (decision below), so it inlines the
  equivalent insert in Deno rather than importing this RN-split repo; this repo remains
  the client-side reader/writer for other paths.
- `src/data/types.ts:40` — `EstimationRun` / `NewEstimationRun` types define the row shape
  the function must produce (`source`, `input_summary`, `raw_result`).
- `supabase/migrations/20260720120000_core_log_schema.sql:49` — `estimation_runs` schema
  and `entry_source` enum (`free_text` is the source marker for this slice).
- `scripts/run-smoke.mjs` — the esbuild `onResolve` shim pattern (force `.web` variants,
  no-op the RN URL polyfill) that lets a Node script import the platform-split client;
  F-02's smoke script reuses this exact harness.

## Desired End State

A deployed `estimate` Edge Function that:

- rejects any request without a valid owner session JWT;
- accepts `{ input: { kind: 'text', text: string } }` (with `kind: 'image'` reserved,
  unimplemented) and, when `text` is a recognizable meal, returns a structured estimate
  `{ name, calories, protein_g, carbs_g, fat_g, food_category, assumptions[], recognized: true, confidence }`
  plus the `runId` of a recorded `EstimationRun`;
- when the text is **not** a recognizable meal, returns `recognized: false` with **no
  fabricated macros**, so the client offers manual entry (FR-008);
- never exposes the AI key to any client or bundle.

Verified end-to-end by `npm run smoke:estimate` (exits 0): a real text input yields a
valid estimate with surfaced assumptions and a persisted `estimation_runs` row; a
gibberish input yields `recognized: false` with null macros.

## What We're NOT Doing

- **No feature UI.** The review-before-commit screen and the "offer manual entry"
  affordance are S-01. F-02 ships only the endpoint + typed client seam.
- **No image/photo estimation.** The `image` input variant is reserved in the contract
  but returns "unsupported" until S-03/S-04. No camera, no storage, no vision call.
- **No multi-item / per-component decomposition (FR-083).** One meal → one aggregate
  estimate. Per-component is nice-to-have and gated by OQ-6 (still open); adding it now
  would commit to a component model before that decision and before any table exists.
- **No server-side confidence *threshold* / ambiguity policy (OQ-11).** The function
  surfaces the model's `recognized` + `confidence` as data; whether to push back for a
  count/size is an S-01 review-step decision, kept out of the server.
- **No schema/migration changes.** `estimation_runs` is reused as-is.
- **No retry/queue/offline handling.** Online-only per PRD Non-Goals (OQ-4); the client
  surfaces transport/quota errors, it does not queue.
- **No `meal_entries` writes.** Logging the reviewed estimate into a day is S-01.

## Implementation Approach

Four phases mirroring F-01's shape (scaffold → integrate → client seam → verify), with a
manual-confirmation pause after each:

1. **Estimation core** — the Deno function that turns text into a structured estimate via
   Opus 4.8 + structured outputs, behind the AI secret. Testable in isolation before any
   DB write.
2. **Auth + persistence** — verify the owner JWT, record the `EstimationRun` under the
   caller's RLS, return `{ runId, estimate }`.
3. **Client seam** — the typed `supabase.functions.invoke('estimate', …)` wrapper and the
   shared request/response contract types, with error mapping.
4. **Verification + docs** — the esbuild-bundled smoke script and the secret/setup docs.

The load-bearing design choices (settled during planning): Supabase Edge Function;
Opus 4.8; server-side run recording; structured outputs; explicit `recognized`+`confidence`
in the response; a discriminated-union input contract from day one; aggregate-only.

## Critical Implementation Details

- **Deno runtime, not Node.** The function runs under Deno on Supabase. Import the
  Anthropic SDK via the `npm:` specifier (`npm:@anthropic-ai/sdk`) or call the REST API
  with `fetch`; do **not** attempt to import anything from `src/` (RN/Expo modules will
  not resolve). The function is self-contained under `supabase/functions/estimate/`.
- **Model call contract.** Use `claude-opus-4-8` with adaptive thinking
  (`thinking: { type: "adaptive" }`) and `output_config.format` (a JSON schema) so macros
  are guaranteed-parseable. The estimate JSON schema uses `additionalProperties: false`
  and a `required` list; numeric sanity bounds (non-negative, calories roughly consistent
  with macros) are validated in the function **after** parsing, not in the schema
  (structured outputs cannot express numeric min/max). Keep `max_tokens` modest
  (~1024) — the output is a small object.
- **`recognized: false` still records a run.** An AI call was made and billed, so an
  `EstimationRun` row is written regardless; the row's `raw_result` captures the model's
  response. Only the returned `estimate` differs: macros are `null` and `recognized` is
  `false`. This keeps "one AI call per entry ⇒ one run recorded" invariant true and lets
  analytics see low-confidence attempts.
- **JWT forwarding.** The client attaches the owner session automatically via
  `supabase.functions.invoke`; inside the function, build a request-scoped Supabase client
  from the incoming `Authorization` header so the `estimation_runs` insert runs under the
  owner's RLS (not a service-role bypass). Set the function to require a verified JWT.
- **Secret name.** The AI key is `ANTHROPIC_API_KEY`, set via Supabase function secrets
  (MCP or `supabase secrets set`). It appears in **no** `.env*` file and **no** bundle.

## Phase 1: Edge function + AI estimation core

### Overview

Create the first Edge Function and make it turn a text meal description into a validated,
structured estimate via Opus 4.8 — behind the AI secret, with no DB write yet.

### Changes Required:

#### 1. Edge function scaffold

**File**: `supabase/functions/estimate/index.ts`

**Intent**: Stand up the Deno HTTP handler for the `estimate` function. It parses the
request body, dispatches on the input union (`text` implemented, `image` returns an
explicit "unsupported" error), calls the model, validates the parsed estimate, and returns
it. Persistence and auth arrive in Phase 2 — this phase may run with JWT verification on
but no run recording yet.

**Contract**: `POST` handler. Request body (Phase-1 subset):
`{ input: { kind: 'text', text: string } }`. Response (Phase-1 subset):
`{ estimate: Estimate }` where
`Estimate = { name: string, calories: number|null, protein_g: number|null, carbs_g: number|null, fat_g: number|null, food_category: string, assumptions: string[], recognized: boolean, confidence: 'low'|'medium'|'high' }`.
Include shared CORS headers (needed for the web build's `functions.invoke`).

#### 2. Anthropic call with structured outputs

**File**: `supabase/functions/estimate/estimate.ts` (helper imported by `index.ts`)

**Intent**: Encapsulate the model call: build the system + user prompt from the text,
request `claude-opus-4-8` with `output_config.format` bound to the estimate JSON schema,
and return the parsed object. The prompt instructs the model to (a) assume a typical
portion when none is stated and list every such assumption in `assumptions` (FR-082),
(b) use stated quantities rather than overriding them (FR-081), and (c) set
`recognized: false` with null macros when the text is not a identifiable food (FR-008).

**Contract**: `estimateFromText(text: string): Promise<Estimate>`. Uses
`new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })`. The JSON schema mirrors
`Estimate` with `additionalProperties: false`; `food_category` is a free string here (the
S-05 taxonomy maps it later). Post-parse validation: coerce negatives to null and drop
the estimate to `recognized: false` if required macro fields are absent when
`recognized: true`.

#### 3. Shared function-local types

**File**: `supabase/functions/estimate/types.ts`

**Intent**: Deno-local copies of the request/response contract types (the client keeps its
own copy in `src/` — Phase 3 — since Deno and RN builds don't share a module graph). One
canonical shape, two hand-kept-in-sync declarations; the smoke test (Phase 4) is what
guarantees they agree at runtime.

**Contract**: `EstimateInput` (discriminated union on `kind`), `Estimate`,
`EstimateRequest`, `EstimateResponse`.

#### 4. Set the AI secret + register the function

**File**: `supabase/config.toml` (function registration if needed) + Supabase function secrets

**Intent**: Set `ANTHROPIC_API_KEY` as a function secret on project
`hkelauazmbqnyohjbjtw` (via MCP `deploy_edge_function` / secrets, mirroring how F-01
applied migrations through the MCP). Deploy the `estimate` function.

**Contract**: Secret `ANTHROPIC_API_KEY` present in the function environment; function
`estimate` deployed and invocable. No secret added to any `.env*` file.

### Success Criteria:

#### Automated Verification:

- Function type-checks under Deno: `deno check supabase/functions/estimate/index.ts`
- App still type-checks and lints (no `src/` changes yet): `tsc --noEmit`, `npm run lint`

#### Manual Verification:

- A direct authenticated invocation with a sample text ("2 scrambled eggs and toast")
  returns a well-formed `Estimate` with non-null macros and at least one surfaced
  assumption.
- A gibberish input ("asdfqwer") returns `recognized: false` with null macros.
- The deployed function's environment contains `ANTHROPIC_API_KEY`; it appears in no
  committed file and no exported bundle.

**Implementation Note**: After this phase and all automated checks pass, pause for manual
confirmation before Phase 2.

---

## Phase 2: Owner-JWT auth + EstimationRun recording

### Overview

Make the function require the owner session and record every estimation as an immutable
`EstimationRun` under the caller's RLS, returning the run id alongside the estimate.

### Changes Required:

#### 1. Require and forward the owner JWT

**File**: `supabase/functions/estimate/index.ts`

**Intent**: Reject unauthenticated calls, and build a request-scoped Supabase client from
the incoming `Authorization` header so all DB access runs as the owner (RLS-enforced, no
service-role bypass).

**Contract**: Missing/invalid JWT → `401`. On success, a `createClient(SUPABASE_URL,
SUPABASE_ANON_KEY, { global: { headers: { Authorization } } })` scoped to the caller.
`SUPABASE_URL` / `SUPABASE_ANON_KEY` come from the function's built-in env.

#### 2. Record the EstimationRun server-side

**File**: `supabase/functions/estimate/index.ts` (+ a small `record-run.ts` helper)

**Intent**: After obtaining an estimate, insert one `estimation_runs` row and return its
id. `source` is `'free_text'` (the FR-006 marker for this slice, derived from
`input.kind`); `input_summary` is a short echo of the text; `raw_result` is the full model
response (the parsed estimate plus provider metadata) for auditability. Recorded on both
the `recognized: true` and `recognized: false` paths.

**Contract**: `EstimateResponse = { runId: string, estimate: Estimate }`. The insert
selects the new row's `id`. If the insert fails, the function returns a `5xx` with a
typed error code and does **not** return a partial success (the client should surface a
retryable error, not log a run-less estimate).

#### 3. Map input kind → source marker

**File**: `supabase/functions/estimate/estimate.ts` (or a `source.ts` helper)

**Intent**: Centralize the `input.kind → entry_source` mapping (`text → free_text`;
`image → label_scan`/`plate_photo` reserved for S-03/S-04) so later slices extend one place.

**Contract**: `sourceForInput(input: EstimateInput): EntrySource`.

### Success Criteria:

#### Automated Verification:

- Function type-checks under Deno: `deno check supabase/functions/estimate/index.ts`

#### Manual Verification:

- An unauthenticated invocation is rejected with `401`.
- An authenticated text invocation writes exactly **one** `estimation_runs` row owned by
  the owner (`source = 'free_text'`, `raw_result` populated) and returns its `runId`.
- A second owner cannot read the first owner's run (RLS holds) — confirmed via the
  anon/non-owner check reused from the F-01 pattern.
- The `recognized: false` path still records a run (with null macros in the returned
  estimate).

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Client invocation seam + shared contract types

### Overview

Give the app a single typed way to call the proxy, with the request/response contract
mirrored on the client side and transport/recognition errors mapped for the UI.

### Changes Required:

#### 1. Client contract types

**File**: `src/data/estimation-types.ts`

**Intent**: The client-side copy of the `EstimateInput` / `Estimate` / `EstimateRequest`
/ `EstimateResponse` contract (the function keeps its own Deno copy). Kept in sync by the
Phase-4 smoke test, which exercises the real wire shape.

**Contract**: Exported types matching `supabase/functions/estimate/types.ts`. `Estimate`
reuses the macro field names from `src/data/types.ts` (`calories`, `protein_g`,
`carbs_g`, `fat_g`) so an estimate maps cleanly onto a `NewMealEntry` in S-01.

#### 2. Estimation client wrapper (the seam)

**File**: `src/data/estimation.ts`

**Intent**: A single function the S-01 UI (and later S-03/S-04) calls, wrapping
`supabase.functions.invoke('estimate', { body })`. It builds the request from a typed
input, returns the typed `EstimateResponse`, and maps failures into a small discriminated
error type so the caller can distinguish "offer manual entry" (`recognized: false`, a
normal success) from "transport/quota error" (retryable). This is the client analogue of
the repo seam — UI never calls `functions.invoke` directly.

**Contract**: `estimateMeal(input: EstimateInput): Promise<EstimateResult>` where
`EstimateResult` is either `{ ok: true; runId; estimate }` or
`{ ok: false; error: 'network' | 'quota' | 'server' }`. `recognized: false` is an
`ok: true` result carrying a null-macro estimate — not an error. Always imports
`@/lib/supabase` (never a platform file directly).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `tsc --noEmit`
- Linting passes: `npm run lint`
- App bundles for web without error: `npx expo export --platform web`

#### Manual Verification:

- `estimateMeal` returns a typed estimate for a text input from both a native context and
  the web build (against the deployed function).
- No `ANTHROPIC_API_KEY` (or any provider secret) is present in the exported web bundle.
- A forced transport failure surfaces as `{ ok: false, error: ... }`, not a thrown
  unhandled rejection.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Verification smoke + docs

### Overview

Prove the whole path end-to-end without a device, and document the secret/setup so the
owner can reproduce it. Closes the slice and unblocks S-01.

### Changes Required:

#### 1. Estimate smoke script

**File**: `scripts/estimate-smoke.ts` + `scripts/run-estimate-smoke.mjs`

**Intent**: A Node script that signs in as the owner (reusing `.env.local` creds), calls
the client seam `estimateMeal` against the **deployed** function, and asserts the full
contract. Bundled with esbuild using the same `onResolve` shim as `scripts/run-smoke.mjs`
(force `.web` variants, no-op the RN URL polyfill) so the platform-split client loads
under Node.

**Contract**: Asserts, for a real meal text: `ok: true`, `recognized: true`, non-null
macros, ≥1 assumption, a non-empty `runId`, and that an `estimation_runs` row with that id
exists and is owner-scoped. For a gibberish text: `ok: true`, `recognized: false`, null
macros (no fabricated numbers, FR-008). Exits non-zero on any failure.

#### 2. npm script

**File**: `package.json`

**Intent**: Add `smoke:estimate` mirroring the existing `smoke` script (env via
`--env-file`).

**Contract**: `"smoke:estimate": "node --env-file=.env --env-file-if-exists=.env.local scripts/run-estimate-smoke.mjs"`.

#### 3. Docs

**File**: `.env.example` (note the AI key is a Supabase function secret, not an env var) +
`context/changes/ai-estimation-proxy/verification.md`

**Intent**: Record that `ANTHROPIC_API_KEY` is set as a Supabase function secret (never in
`.env`/`.env.local`/bundle), how to deploy the function, and the smoke result. Mirror the
F-01 `verification.md` structure.

**Contract**: `.env.example` gains a commented pointer; `verification.md` records the smoke
run and the manual auth/RLS checks.

### Success Criteria:

#### Automated Verification:

- Smoke script passes end-to-end: `npm run smoke:estimate` exits 0.
- Type checking and lint still pass: `tsc --noEmit`, `npm run lint`.

#### Manual Verification:

- `verification.md` records the run and result.
- The `.env.example` note makes clear the AI key is a function secret, not a build-time
  value.

**Implementation Note**: This phase closes the slice. After the smoke passes and docs are
updated, F-02 is done and the S-01 north star is unblocked (F-01 ✅ + F-02 ✅).

---

## Testing Strategy

### Unit-ish (function-level):

- Text → estimate happy path returns non-null macros + surfaced assumptions.
- Gibberish → `recognized: false`, null macros (never fabricates — FR-008).
- Stated quantity ("200g chicken") is reflected rather than overridden (FR-081).
- No-quantity input produces a visible portion assumption (FR-082).

### Integration:

- End-to-end via `npm run smoke:estimate` (client seam → deployed function → Opus 4.8 →
  `estimation_runs` insert), asserting the full contract and the persisted run.
- Auth: unauthenticated call rejected `401`; RLS blocks cross-owner reads of runs.

### Manual Testing Steps:

1. Invoke `estimate` with a sample meal text; confirm a review-ready estimate + `runId`.
2. Invoke with gibberish; confirm `recognized: false`, no numbers.
3. Grep the exported web bundle for the provider key — confirm absent.

## Performance Considerations

Volume is a few hundred estimations/month, one AI call per entry (NFR). `max_tokens` is
small (~1024) and the model returns a compact object, so latency and cost stay low even on
Opus 4.8. No caching, batching, or scaling work is warranted (single-owner tool).

## Migration Notes

None — `estimation_runs` is reused unchanged from F-01.

## References

- Roadmap item: `context/foundation/roadmap.md` → F-02
- Reused data layer (archived): `context/archive/2026-07-20-synced-data-backbone/`
- Existing run seam: `src/data/estimation-runs.repo.ts`, `src/data/types.ts`
- Verification harness to mirror: `scripts/run-smoke.mjs`, `scripts/smoke-store.ts`
- Model/API reference: Claude API skill (Opus 4.8, structured outputs `output_config.format`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Edge function + AI estimation core

#### Automated

- [x] 1.1 Function type-checks under Deno: `deno check supabase/functions/estimate/index.ts` — run via `npx deno@2 check` (Deno not installed locally); exit 0 — 861c0a0
- [x] 1.2 App still type-checks and lints: `tsc --noEmit`, `npm run lint` — both exit 0; `supabase/functions` excluded from tsconfig + eslint — 861c0a0

#### Manual

- [x] 1.3 Sample text returns a well-formed estimate with non-null macros and ≥1 assumption — "2 scrambled eggs and toast" → 320 kcal, 3 assumptions — 861c0a0
- [x] 1.4 Gibberish input returns `recognized: false` with null macros — "asdfqwer" → recognized:false, null macros — 861c0a0
- [x] 1.5 Deployed function has `ANTHROPIC_API_KEY`; key absent from every committed file and the bundle — no `sk-ant` in tree; not in src/ or .env — 861c0a0

### Phase 2: Owner-JWT auth + EstimationRun recording

#### Automated

- [x] 2.1 Function type-checks under Deno: `deno check supabase/functions/estimate/index.ts` — via `npx deno@2 check` (incl. jsr `@supabase/supabase-js`); exit 0. App `tsc`/`lint` still exit 0. — 94b8076

#### Manual

- [x] 2.2 Unauthenticated invocation rejected with `401` — no-auth → 401 (platform verify_jwt); anon-only → 401 (getUser gate) — 94b8076
- [x] 2.3 Authenticated text invocation writes exactly one owner-scoped `estimation_runs` row and returns its `runId` — row has source=free_text, raw_result populated, owner_id=owner — 94b8076
- [x] 2.4 Non-owner cannot read the first owner's run (RLS holds) — anon select estimation_runs → [] — 94b8076
- [x] 2.5 `recognized: false` path still records a run (null macros in the returned estimate) — gibberish → runId returned, run recorded, recognized:false — 94b8076

### Phase 3: Client invocation seam + shared contract types

#### Automated

- [x] 3.1 Type checking passes: `tsc --noEmit` — exit 0 — a8f2201
- [x] 3.2 Linting passes: `npm run lint` — exit 0 — a8f2201
- [x] 3.3 App bundles for web without error: `npx expo export --platform web` — exit 0; 3 web bundles, 4 static routes — a8f2201

#### Manual

- [x] 3.4 `estimateMeal` returns a typed estimate from both native and web against the deployed function — web/Node path verified against the deployed function ("a bowl of porridge with honey" → 290 kcal, 3 assumptions, runId 9d6937dd; gibberish → recognized:false, null macros; reserved image variant → ok:false/server). **Native context closed 2026-07-24 by S-01's Phase 4 device run** (`context/changes/free-text-meal-logging/verification.md`).
- [x] 3.5 No provider secret present in the exported web bundle — scanned 36 files / 4.0 MB: no `sk-ant`, no `ANTHROPIC_API_KEY`, no `anthropic` (any case); owner email/password from `.env.local` also absent (only `EXPO_PUBLIC_*` is inlined) — a8f2201
- [x] 3.6 A forced transport failure surfaces as `{ ok: false, error }`, not an unhandled rejection — client pointed at an unroutable host → `{"ok":false,"error":"network"}`, no throw — a8f2201

### Phase 4: Verification smoke + docs

#### Automated

- [x] 4.1 Smoke script passes end-to-end: `npm run smoke:estimate` exits 0 — real meal → 330 kcal / 3 assumptions / owner-scoped run; gibberish → recognized:false, null macros; anon sees 0 runs — 079c98d
- [x] 4.2 Type checking and lint still pass: `tsc --noEmit`, `npm run lint` — both exit 0 (root tsc covers `scripts/`) — 079c98d

#### Manual

- [x] 4.3 `verification.md` records the run and result — plus the Phase 2 auth/RLS table, the bundle scan, and the two known gaps — 079c98d
- [x] 4.4 `.env.example` note makes clear the AI key is a function secret, not a build-time value — documents `supabase secrets set`, warns against adding it to `.env`/`.env.local` — 079c98d
