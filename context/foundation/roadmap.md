---
project: "Personal Nutrition Tracker"
version: 1
status: draft
created: 2026-07-19
updated: 2026-07-24
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
---

# Roadmap: Personal Nutrition Tracker

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Existing diet trackers make logging so manual that the owner abandons it after a few days — and the daily number is worthless unless it is captured every day. This tool reframes the whole product around one principle, *minimal manual input*: three capture paths (free text, photo, saved meal) are alternative front doors into a single estimate-and-log flow, where a multimodal model produces a rough-but-consistent first-pass number the owner reviews and commits. It is a single-user personal utility — one owner, PIN-gated, no accounts — whose success is measured by continuity (does the owner keep logging?) rather than by lab-grade accuracy.

## North star

**S-01: Log a meal by typing it** — the owner types a description, gets an AI estimate, reviews it, and commits it to today. It is the validation milestone because it exercises the full estimate-and-log loop — the product's *core bet* — with the least scaffolding of any capture path, and the market-feedback goal says prove that bet before building anything that depends on it.

> "North star" here means the smallest end-to-end slice whose success would prove the product's core bet — that AI estimation is low-friction and accurate enough that the owner keeps logging every day — placed as early as its Prerequisites allow, because every other slice only matters if this one works. The "riskiest assumption" this de-risks is exactly that bet: the free-text path proves it with no camera, no photo storage, and the cheapest possible AI call.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                              | Prerequisites   | PRD refs                              | Status   |
| ---- | ---------------------------- | ---------------------------------------------------------------- | --------------- | ------------------------------------- | -------- |
| F-01 | synced-data-backbone         | (foundation) log entries persist to a private synced store       | —               | FR-043, FR-041, FR-007, US-07         | done     |
| F-02 | ai-estimation-proxy          | (foundation) estimates come from an off-device serverless proxy  | —               | FR-080, FR-005, FR-006                | done     |
| S-01 | free-text-meal-logging       | log a meal by typing it and reviewing the AI estimate            | F-01, F-02      | US-11, US-12, US-08, FR-080/081/082/084, FR-005/006/008, FR-030 | done     |
| S-02 | profile-and-targets          | set body stats and see derived, overridable daily targets        | F-01            | US-05, FR-020/021/022/023             | proposed |
| S-05 | food-icon-system             | see every entry carry a consistent category icon                 | F-02, S-01      | US-13, FR-050/051/052                 | proposed |
| S-03 | label-scan-logging           | log a packaged product by photographing its nutrition label      | F-01, F-02, S-01| US-03, FR-001/002, FR-005/006/007/008, FR-040 | proposed |
| S-06 | structured-day-view          | see the day as five sections with subtotals and a running total  | S-01, S-05      | US-10, FR-056/057/058/059/060/061/064, FR-030 | proposed |
| S-08 | saved-meals-library          | save a meal and re-log it in one tap                             | S-01, S-05      | US-04, FR-010/011/012, FR-055         | proposed |
| S-04 | plate-photo-logging          | log a plate by photo and correct it with a weight                | F-01, F-02, S-03| US-01, US-02, FR-003/004, FR-005/006/007/008 | blocked  |
| S-07 | meal-detail-view             | inspect a meal's full breakdown and edit/re-section/delete it    | S-05, S-06      | US-09, FR-062/063                     | blocked  |
| S-09 | training-and-dynamic-budget  | log training and earn calories back as a two-sided ledger        | S-02, S-06      | US-14, US-15, FR-070/071/072/073/075  | blocked  |
| S-12 | pin-access-gate              | gate the app behind a PIN on both clients                        | F-01            | FR-042                                | blocked  |
| S-11 | analytics-and-trends         | see intake/expenditure/net trends and weight-vs-goal over time   | S-02, S-06, S-09| US-06, FR-031/032/033/034             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                    | Chain                                    | Note                                                                        |
| ------ | ------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- |
| A      | AI capture & log         | `F-02` → `S-01` → `S-03` → `S-04`        | Holds the north star (`S-01`); `S-04` blocked on OQ-6. Joins Stream B via `F-01`. |
| B      | Day container & detail   | `F-01` → `S-06` → `S-07`                 | `F-01` also unlocks Streams A/D/E; `S-06` needs `S-05` from Stream C; `S-07` blocked on OQ-6. |
| C      | Visual identity & reuse  | `S-05` → `S-08`                          | Joins Stream A at `S-01` (both need it) and feeds `S-06`.                    |
| D      | Budget & trends          | `S-02` → `S-09` → `S-11`                 | `S-09` blocked on OQ-9; joins Stream B at `S-06`. Sequenced last (needs accumulated data). |
| E      | Access gate              | `S-12`                                   | Standalone (needs only `F-01`); blocked on OQ-8.                            |

## Baseline

What's already in place in the codebase as of 2026-07-19 (auto-researched, verified against `src/` + `package.json` + health-check, and user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Expo SDK 57 / RN 0.86 with expo-router typed routes and home-grown theming (`src/constants/theme.ts`, `ThemedText`/`ThemedView`). Only the demo scaffold (`index`/`explore`) exists; no feature UI yet.
- **Backend / API:** absent — no server, no API routes, no serverless proxy. Planned per `tech-stack.md`: Supabase + a thin serverless AI-key proxy.
- **Data:** absent — no DB driver, ORM, schema, migrations, or local persistence library.
- **Auth:** absent — none by design; access is a single-owner PIN gate (FR-042), not an auth stack.
- **Deploy / infra:** absent — no CI, no container config, no workflows; no git repo yet (per health-check).
- **Observability:** absent — no logging, error-tracking, or metrics libraries.

## Foundations

### F-01: Synced data backbone

- **Outcome:** (foundation) a logged entry persists to a private, single-owner store that both the phone and the desktop web build read and write, so the same state appears on both clients.
- **Change ID:** synced-data-backbone
- **PRD refs:** FR-043, FR-041, FR-007 (private-storage groundwork), FR-006 (source-marker field), US-07
- **Unlocks:** every logging slice (all write into this store); directly gates the S-01 north star, and validates US-07 cross-client parity as its verification path.
- **Prerequisites:** — (frontend scaffold present)
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Offline capture behaviour (OQ-4) — Owner: user. Block: no (offline-first is a PRD Non-Goal; MVP defaults to online-only and revisits later).
- **Risk:** the core entity shape and section model chosen here ripple into every later slice; keep entities minimal (Meal + EstimationRun + section) so per-component (OQ-6) can be added without a rewrite. Sequenced first because nothing can be logged or synced without it.
- **Status:** done

### F-02: Server-side AI estimation proxy

- **Outcome:** (foundation) a thin serverless endpoint holds the AI provider key off-device, accepts an estimation input (text first, extensible to images), returns a parsed structured estimate, and records an EstimationRun; the client never sees the key.
- **Change ID:** ai-estimation-proxy
- **PRD refs:** FR-080 (text estimation server-side), FR-005 (returns a reviewable estimate), FR-006, NFR (one AI call per entry; key off device)
- **Unlocks:** S-01 (north star free-text estimate), S-03 (label extraction), S-04 (plate estimation) — all reuse this endpoint and its request/response contract.
- **Prerequisites:** — (pairs with F-01 to store EstimationRun, but buildable independently)
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Text ambiguity floor — push back for a count/size, or assume-and-show (OQ-11) — Owner: user. Block: no (FR-082 assume-and-surface is the default; the review step is the safety net).
- **Risk:** the estimate request/response contract is reused by every AI capture path; designing it text-first but image-extensible now avoids a breaking change when S-03/S-04 land. Sequenced early because the north star cannot function without it.
- **Status:** done

## Slices

### S-01: Log a meal by typing it  *(north star)*

- **Outcome:** the owner types a free-text description, receives an AI estimate with its assumptions shown, edits any value, and commits it to today — or is offered manual entry if recognition fails, with nothing logged silently.
- **Change ID:** free-text-meal-logging
- **PRD refs:** US-11, US-12, US-08, FR-080, FR-081, FR-082, FR-084, FR-005, FR-006, FR-008, FR-030 (running daily total)
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - How vague is too vague before the system asks for a count/size (OQ-11) — Owner: user. Block: no (default to assume-and-surface per FR-082; review catches it).
- **Risk:** this is the walking skeleton — it wires the proxy, the review-before-commit UI, and persistence into one vertical. Keep the day surface minimal (a flat "today" list with a running total); the sectioned view and budget target arrive in S-06/S-02. If this loop does not feel effortless, the whole product bet fails, which is why it is sequenced first.
- **Status:** done

### S-02: Set up profile and derived targets

- **Outcome:** the owner enters height, weight, age, sex, activity level and goal, sees derived daily calorie and macro targets (sedentary-baseline / Model A), can override any of them, and can log body weight as its own series.
- **Change ID:** profile-and-targets
- **PRD refs:** US-05, FR-020, FR-021, FR-022, FR-023
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** target derivation is a BMR/TDEE-class formula fixed at sedentary baseline (OQ-1 resolved), so scope is well-defined; the main care is that overrides never get overwritten by re-derivation. Provides the budget target that FR-030 and the S-06 day view measure against.
- **Status:** proposed

### S-05: Food icon system

- **Outcome:** every logged entry carries an icon from a fixed, bundled set, auto-assigned by mapping the identified food to a category, with a generic fallback — so the day is visually parseable at zero per-entry cost.
- **Change ID:** food-icon-system
- **PRD refs:** US-13, FR-050, FR-051, FR-052
- **Prerequisites:** F-02 (the estimate must return a food category to map), S-01 (entries to iconize)
- **Parallel with:** S-02, S-03
- **Blockers:** —
- **Unknowns:**
  - Which icon set and how many categories before the generic fallback is conspicuous (OQ-2) — Owner: user. Block: no (planning proceeds; a starter 25–40-category taxonomy is chosen during `/10x-plan`).
- **Risk:** category taxonomy is a tuning problem, not a structural one; start coarse and refine. Sequenced before the day/detail views because FR-061 requires every listed entry to show its icon.
- **Status:** proposed

### S-03: Log a packaged product by label scan

- **Outcome:** the owner photographs a nutrition label, the system extracts calories/protein/carb/fat/serving size, and the values are logged (marked as a label scan) without typing any numbers.
- **Change ID:** label-scan-logging
- **PRD refs:** US-03, FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-040
- **Prerequisites:** F-01, F-02, S-01 (reuses the estimate-and-log review/commit flow)
- **Parallel with:** S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Discard source photos after N days or retain indefinitely (OQ-7) — Owner: user. Block: no (default retain-as-evidence; a retention policy can be added later).
- **Risk:** this establishes the photo-capture pipeline (camera + gallery + evidence-only retention) that S-04 reuses. Chosen as the first photo path because label OCR is near-exact and does NOT need the per-component decision (OQ-6) that blocks the plate path — so a capture path ships while OQ-6 is still open.
- **Status:** proposed

### S-06: See the structured day

- **Outcome:** the owner sees today as five fixed sections (breakfast, snack, lunch, bite, supper), each with its own subtotal alongside the day's total and running total, with new entries defaulting to a section by time-of-log and movable between sections.
- **Change ID:** structured-day-view
- **PRD refs:** US-10, FR-056, FR-057, FR-058, FR-059, FR-060, FR-061, FR-064, FR-030
- **Prerequisites:** S-01, S-05
- **Parallel with:** S-08, S-03
- **Blockers:** —
- **Unknowns:**
  - Time boundaries that drive the inferred section (OQ-10) — Owner: user. Block: no (default boundaries shipped; tuned to the owner's eating pattern later).
- **Risk:** `section` is a required field on every entry (subtotals must be computable without inference), so this formalises the container S-01 wrote into. FR-030's "against the adjusted budget" is only fully realised once S-02 (target) and S-09 (burn adjustment) land — noted so the running total isn't mistaken for complete here.
- **Status:** proposed

### S-08: Save and reuse meals

- **Outcome:** the owner saves any logged meal to a reusable library (with its icon) and re-logs it into any day in at most two taps, with no AI call; edits to a saved meal never retroactively change already-logged entries.
- **Change ID:** saved-meals-library
- **PRD refs:** US-04, FR-010, FR-011, FR-012, FR-055
- **Prerequisites:** S-01, S-05
- **Parallel with:** S-06, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** the copy-on-log semantics (a saved-meal edit must not mutate history) is the one subtlety; otherwise this is straightforward reuse of the entry model. Independent of the day-view and detail slices, so it can run in parallel.
- **Status:** proposed

### S-04: Log a plate by photo

- **Outcome:** the owner photographs a prepared meal, the system estimates calories/macros with an implied portion, and supplying a total (or per-component) weight rescales the estimate before commit — marked as a plate photo, with the photo retained as evidence only.
- **Change ID:** plate-photo-logging
- **PRD refs:** US-01, US-02, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
- **Prerequisites:** F-01, F-02, S-03 (reuses the photo-capture pipeline)
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - One aggregate number per plate, or a per-component breakdown (OQ-6) — Owner: user. Block: yes. Per-component enables per-item weight correction (FR-004) and reshapes the Meal/MealComponent model; the plate slice's scope cannot be fixed until this is decided.
- **Risk:** building against the wrong model risks reworking the meal schema and the detail view. Deferred behind S-03 (which needs no per-component decision) precisely so a photo capture path can ship while OQ-6 is still open.
- **Status:** blocked

### S-07: Inspect and edit a single meal

- **Outcome:** the owner taps an entry to see its full macro breakdown, icon, source marker, and per-component breakdown (each component with its own icon), and can edit, re-section, or delete it — with section subtotals and the daily total recalculating.
- **Change ID:** meal-detail-view
- **PRD refs:** US-09, FR-062, FR-063
- **Prerequisites:** S-05, S-06
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Per-component breakdown vs aggregate (OQ-6) — Owner: user. Block: yes. FR-062 (must-have) requires displaying a per-component breakdown with each component's icon; whether components are first-class is exactly OQ-6.
- **Risk:** the edit/re-section/delete core (FR-063) is ready to plan, but FR-062's component display depends on OQ-6, so the slice as written is blocked. Resolving OQ-6 unblocks both this and S-04.
- **Status:** blocked

### S-09: Log training and earn calories back

- **Outcome:** the owner logs a training session (type, duration, intensity), the system estimates the burn from those attributes and body weight (overridable), that burn is added to the day's budget per Model A, and the day is shown as a two-sided ledger — in, out, net.
- **Change ID:** training-and-dynamic-budget
- **PRD refs:** US-14, US-15, FR-070, FR-071, FR-072, FR-073, FR-075 (FR-074 saved sessions — optional, nice-to-have)
- **Prerequisites:** S-02 (body weight + budget target), S-06 (a day to adjust)
- **Parallel with:** S-04, S-07
- **Blockers:** —
- **Unknowns:**
  - MET-table lookup vs AI estimate from a free-text session description (OQ-9) — Owner: user. Block: yes. The two approaches differ materially (deterministic/free vs reuses the F-02 proxy) and change the slice's implementation and cost.
- **Risk:** this closes the dynamic-budget loop that makes FR-030's "adjusted budget" real; until OQ-9 is decided the burn-estimation path can't be planned. The double-counting hazard is already resolved (Model A), so the budget arithmetic itself is settled.
- **Status:** blocked

### S-12: Gate access behind a PIN

- **Outcome:** the owner sets a PIN that gates access to the app; opening it requires the PIN.
- **Change ID:** pin-access-gate
- **PRD refs:** FR-042
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - Does the PIN gate the desktop client too, and is there any recovery path if forgotten (OQ-8) — Owner: user. Block: yes. Both the scope and the recovery flow must be decided before this can be planned.
- **Risk:** a deliberately weak single-owner gate, not an auth stack — low structural risk, but the desktop-scope and recovery questions (OQ-8) are genuine product decisions. Orthogonal to the capture slices, so its position is late only because it is not on the validation path.
- **Status:** blocked

### S-11: See whether I am on track

- **Outcome:** the owner sees weekly/monthly intake, expenditure, and net trends with moving averages, body weight plotted against goal over time, and an adherence signal — and can browse and edit any past day.
- **Change ID:** analytics-and-trends
- **PRD refs:** US-06, FR-031, FR-032, FR-033, FR-034
- **Prerequisites:** S-02 (targets + weight series), S-06 (day structure to browse), S-09 (expenditure for net trends)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** analytics needs accumulated days before it shows anything meaningful, so it is sequenced last regardless of goal; net trends depend on S-09's expenditure data, which is itself blocked on OQ-9. No new unknowns of its own.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                    | Suggested issue title                                  | Ready for `/10x-plan` | Notes |
| ---------- | ---------------------------- | ------------------------------------------------------ | --------------------- | ----- |
| F-01       | synced-data-backbone         | Synced single-owner data backbone (Supabase)           | done                  | Shipped 2026-07-22; archived |
| F-02       | ai-estimation-proxy          | Server-side AI estimation proxy (text-first)           | done                  | Shipped 2026-07-24; archived |
| S-01       | free-text-meal-logging       | Free-text meal logging (north star)                    | yes                   | Unblocked — F-01 ✅ + F-02 ✅. Run `/10x-plan free-text-meal-logging` |
| S-02       | profile-and-targets          | Profile, derived targets, and body-weight series       | no                    | Plan after F-01 |
| S-05       | food-icon-system             | Bundled food-icon system with category mapping         | no                    | Plan after S-01; taxonomy (OQ-2) chosen in plan |
| S-03       | label-scan-logging           | Label-scan logging + photo-capture pipeline            | no                    | Plan after S-01 |
| S-06       | structured-day-view          | Five-section structured day view with subtotals        | no                    | Plan after S-01 + S-05 |
| S-08       | saved-meals-library          | Saved-meals library with one-tap re-log                | no                    | Plan after S-01 + S-05 |
| S-04       | plate-photo-logging          | Plate-photo logging with weight correction             | no                    | Blocked on OQ-6 |
| S-07       | meal-detail-view             | Meal detail view with edit/re-section/delete           | no                    | Blocked on OQ-6 |
| S-09       | training-and-dynamic-budget  | Training log + dynamic calorie budget ledger           | no                    | Blocked on OQ-9 |
| S-12       | pin-access-gate              | PIN access gate                                        | no                    | Blocked on OQ-8 |
| S-11       | analytics-and-trends         | Intake/expenditure/net trends and weight-vs-goal       | no                    | Plan after S-02 + S-06 + S-09 |

This table is the clean handoff to Jira/Linear or any MCP-backed backlog.

## Open Roadmap Questions

1. **OQ-6 — Per-component plates vs one aggregate number.** Owner: user. Block: S-04, S-07 (and shapes the Meal/MealComponent data model, so effectively roadmap-wide). Resolving this promotes 2 slices and settles the model F-01 seeded. Highest-leverage question in the roadmap.
2. **OQ-9 — Burn estimation method.** MET-table lookup (deterministic, free) vs AI estimate from a free-text session description (reuses F-02). Owner: user. Block: S-09.
3. **OQ-8 — PIN scope & recovery.** Does the PIN gate desktop too, and is there a recovery path if forgotten? Owner: user. Block: S-12.
4. **OQ-4 — Offline capture behaviour.** Queue-and-estimate-later vs block. Owner: user. Block: roadmap-wide (informs F-01 sync design), but Non-Goal for MVP → default online-only.
5. **OQ-11 — Text ambiguity floor.** Push back for a count/size vs assume-and-surface. Owner: user. Block: none (S-01 defaults to assume-and-surface); resolve to tune data quality vs minimal-input.
6. **OQ-7 — Photo retention.** Discard after N days vs retain indefinitely. Owner: user. Block: none (S-03 defaults to retain-as-evidence).
7. **OQ-2 — Icon set & taxonomy** and **OQ-10 — Section time boundaries.** Owner: user. Block: none (implementation-level; chosen inside `/10x-plan` for S-05 and S-06 respectively).

## Parked

- **User accounts, registration, multi-user support** — Why parked: PRD §Non-Goals; single-owner tool, identity is implicit.
- **Social features, sharing, meal-plan publishing** — Why parked: PRD §Non-Goals.
- **Barcode lookup (OQ-3)** — Why parked: PRD §Non-Goals; packaged products identified from the photographed label only.
- **Recipe builder / ingredient-level composition editor** — Why parked: PRD §Non-Goals; meals are captured and estimated, not authored.
- **Structured workout programming (sets, reps, overload)** — Why parked: PRD §Non-Goals; exercise is an energy-expenditure input only.
- **Wearable / third-party health-platform integration** — Why parked: PRD §Non-Goals; burn comes from logged sessions.
- **Offline-first conflict resolution (OQ-4)** — Why parked: PRD §Non-Goals; MVP is online-only.
- **Notifications / reminders** — Why parked: PRD §Non-Goals; adherence is driven by the app being pleasant to open.
- **Per-meal AI image generation** — Why parked: PRD §Non-Goals; visual identity comes from the bundled icon set (S-05).
- **Export beyond a trivial data dump** — Why parked: PRD §Non-Goals.
- **Lab-grade macro precision** — Why parked: PRD §Non-Goals; rough-but-consistent is the accepted stance.
- **Nice-to-have capture/reuse extras** — voice dictation (FR-085), saved-meal match suggestion (FR-086), saved-meal scaling (FR-013), manual icon override (FR-053). Why parked: nice-to-have priority; fold into the relevant slice later if wanted.
- **Per-component icons & multi-item decomposition (FR-054, FR-083)** — Why parked: nice-to-have and gated by OQ-6; revisit with S-04/S-07 once the per-component decision lands.

## Done

- **F-01: (foundation) log entries persist to a private synced store** — Archived 2026-07-22 → `context/archive/2026-07-20-synced-data-backbone/`. Lesson: —.
- **F-02: (foundation) estimates come from an off-device serverless proxy** — Archived 2026-07-24 → `context/archive/2026-07-22-ai-estimation-proxy/`. Lesson: the client seam should own the "unrecognized vs failed" distinction — `recognized: false` is a successful estimate with null macros (the manual-entry cue, FR-008), not an error; folding it into the error union would have pushed that judgement into every capture UI. Known gap carried forward: native-context invocation is unverified (web/Node path proven), and the `quota` error branch is unreachable while provider 429s surface as the function's own 502.
- **S-01: log a meal by typing it and reviewing the AI estimate** — Archived 2026-07-24 → `context/archive/2026-07-24-free-text-meal-logging/`. Lesson: re-derive "now" per render and let the data hook own it — a day/instant frozen in `useMemo(…, [])` silently rots in a resumed app, so a session spanning midnight watches a stale query key and a meal logged after midnight never appears. Closed F-02's carried-forward gap: this slice's device run is the first proven native invocation of the estimate function.
