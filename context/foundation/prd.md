---
project: "Personal Nutrition Tracker"
version: 1
status: draft
created: 2026-07-19
context_type: greenfield
product_type: mobile
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: null        # deliberately waived — personal project, quality over delivery speed (see shape-notes §3)
  hard_deadline: null
  after_hours_only: true
---

# Personal Nutrition Tracker

## Vision & Problem Statement

Logging food in existing diet trackers is manual and slow: search a database, pick the right variant, type grams, repeat per ingredient. For a single owner who cooks a mix of home-prepared and packaged meals and repeats the same meals often, the friction is high enough that logging gets abandoned after a few days — which destroys the only thing that makes tracking work: continuity. The daily number is worthless if it isn't captured every day.

The insight that makes this worth building: multimodal models can now read a nutrition label, estimate a plate of food, and interpret a loose verbal description well enough for the accuracy level actually needed here — rough-but-consistent, directionally right every day, without effort. That reframes the product around one principle — *minimal manual input* — and lets three capture paths (photo, free text, saved meal) be alternative front doors to the same estimate-and-log flow, so the app never forces the wrong one for the situation.

## User & Persona

**Primary persona — the owner (single user).** An adult who cooks and eats a mix of home-prepared meals and packaged products, repeats the same meals often (e.g. a regular protein shake), has a body-composition goal, and wants to see whether daily habits are trending toward it. Primary device is a phone (in-the-moment capture); a desktop browser is a secondary surface for review and editing against the same data.

There is no secondary persona. This is a single-user tool: no multi-tenancy, no roles, no sharing, no social features.

## Success Criteria

### Primary
- The owner logs at least 80% of days across 8 consecutive weeks (continuity is the real proof the product worked).
- The owner accepts the AI's first estimate without editing in at least 70% of entries (proof the estimate-and-log flow is low-friction enough to sustain).

### Secondary
- The owner can log a repeat meal or a repeat training session with no typing.
- Analytics surface a clear intake-vs-target and body-weight-vs-goal trend once enough days accumulate.

### Guardrails
- No entry is ever logged with a fabricated value: on unrecognized input the product offers manual entry rather than inventing a number.
- Calories are never double-counted between the profile's assumed activity and separately-logged training — the budget uses the sedentary-baseline model (Model A): the profile's activity multiplier is fixed at sedentary/BMR and every logged session adds its burn explicitly (see Business Logic).
- Visual coherence of the day view is achieved at zero marginal per-entry cost (bundled icons, not per-meal image generation).
- The owner's food photos and body-weight history remain private, under the owner's control, and photos are never used as an entry's displayed representation.
- Each photographed or typed entry triggers at most one AI estimation; saved-meal and manual entries trigger none.

## User Stories

### US-01: Log a plate by photo

- **Given** I am about to eat a home-cooked meal
- **When** I photograph the plate and confirm the estimate
- **Then** the meal's calories and macros are added to today's total, and I see how much of my daily target remains

#### Acceptance Criteria
- The estimate is shown for review before it is committed (FR-005)
- The running daily total updates against the adjusted budget (FR-030)
- The entry is marked as a plate-photo estimate (FR-006)

### US-02: Correct a bad estimate with a weight

- **Given** the app estimated my portion as 300 g but the plate is heavier
- **When** I enter the actual total weight of 450 g
- **Then** the calorie and macro figures rescale proportionally before I commit the entry

#### Acceptance Criteria
- Supplying a total or per-component weight rescales the estimate rather than replacing it (FR-004)
- Rescaling happens in the review step, before commit (FR-005)

### US-03: Log a packaged product

- **Given** I am eating a packaged product with a nutrition label
- **When** I photograph the label and confirm the number of servings or total weight of the package
- **Then** the values from the label are logged without me typing any numbers

#### Acceptance Criteria
- Calories, protein, carbohydrate, fat, and serving size are extracted from the label (FR-002)
- The entry is marked as a label-scan estimate (FR-006)

### US-04: Log a repeat meal instantly

- **Given** I drink the same protein shake most mornings
- **When** I tap it in my saved meals
- **Then** it is logged to today with no photo and no editing

#### Acceptance Criteria
- A saved meal logs in at most two interactions (FR-011)
- No AI estimation is triggered for a saved-meal log

### US-05: Set up targets

- **Given** I have entered my height, weight, age, sex, activity level and goal
- **When** I open my profile
- **Then** I see derived daily calorie and macro targets that I can adjust manually

#### Acceptance Criteria
- Targets are derived from the profile, not typed in by hand (FR-021)
- Any derived target is manually overridable (FR-022)

### US-06: See whether I am on track

- **Given** I have been logging for several weeks
- **When** I open the analytics view
- **Then** I see my weekly average intake versus target and my body-weight trend against my goal

#### Acceptance Criteria
- Intake, expenditure, and net trends are shown over selectable ranges with moving averages (FR-032)
- Logged body weight is plotted against the goal over time (FR-033)

### US-07: Continue on desktop

- **Given** I logged meals on my phone this morning
- **When** I open the app on my computer
- **Then** today's entries are already there and any edit I make appears on my phone

#### Acceptance Criteria
- Both clients read and write the same synchronized dataset (FR-043)
- The desktop client is a full read/edit surface against that data (FR-041)

### US-08: Handle a failed recognition

- **Given** I photograph something the model cannot identify
- **When** the estimate fails
- **Then** I am offered manual entry or a saved-meal pick, and nothing is logged silently

#### Acceptance Criteria
- On unreadable/unrecognized input the product offers manual entry instead of logging a fabricated value (FR-008)
- No entry is committed without the owner's confirmation (FR-005)

### US-09: Inspect a single meal

- **Given** I have logged several meals today
- **When** I tap one in the day's list
- **Then** I see its full macro breakdown, its icon, its components with their own icons, and how it was estimated — and I can correct it from there

#### Acceptance Criteria
- The detail view shows full macros, icon, source marker, and any per-component breakdown with each component's icon (FR-062)
- The detail view allows editing, re-sectioning, or deleting, with subtotals and the daily total recalculating (FR-063)

### US-10: See my day the way I actually eat it

- **Given** I have logged across the whole day
- **When** I open today
- **Then** I see breakfast, snack, lunch, bite and supper as separate sections, each with its own subtotal, so I can tell at a glance where my calories are going

#### Acceptance Criteria
- The day is divided into five fixed sections in order (FR-056)
- Each section shows its own subtotal alongside the day's total (FR-059)

### US-11: Log a meal I already ate, from memory

- **Given** I ate several slices of pizza at lunch and never photographed it
- **When** I type "3 slices of pepperoni pizza" and confirm the estimate
- **Then** it is logged with calories, macros and a pizza icon, with no photo involved

#### Acceptance Criteria
- A free-text description is accepted as an alternative to a photo and estimated from (FR-080)
- The entry is marked as a free-text estimate and passes the same review-before-commit step (FR-084)

### US-12: Add detail when I have it

- **Given** I know the specifics of what I ate
- **When** I type "200 g penne, 100 g tomato sauce, 30 g parmesan"
- **Then** the estimate uses my stated quantities rather than guessing portions, and each item appears as its own component

#### Acceptance Criteria
- Stated quantities are used rather than overridden with assumptions (FR-081)
- A multi-item description is decomposed into per-component macros and icons (FR-083)

### US-13: Scan a day at a glance

- **Given** my day contains a dozen entries
- **When** I look at the list
- **Then** every entry carries a recognisable food icon in one consistent style, so I can parse the day visually without reading every label — and this costs nothing per entry

#### Acceptance Criteria
- Every entry carries an icon from a fixed, bundled set with no per-entry runtime cost (FR-050, FR-051)
- Icons are assigned automatically by food category with a generic fallback (FR-052)

### US-14: Earn back calories from training

- **Given** I did a hard session this morning
- **When** I log that session
- **Then** my available calories for the day increase by the burn I logged, and I can see intake, expenditure and net side by side

#### Acceptance Criteria
- The day's burned calories are added to that day's budget, per the selected expenditure model (FR-073, OQ-1)
- The day is shown as a two-sided ledger: in, out, and net against budget (FR-075)

### US-15: Log a routine session fast

- **Given** I do the same gym session most weeks
- **When** I tap it in my saved sessions
- **Then** it is logged with its usual duration and burn, with no typing

#### Acceptance Criteria
- Frequently repeated sessions can be saved for one-tap logging (FR-074)
- Logging a saved session requires no typing — its duration and burn value come from what was saved, not re-entered (FR-074)

## Functional Requirements

### Capture & estimation

- FR-001: User can attach a photo — captured in-app or picked from the device gallery — as the input to a food log entry. Priority: must-have
- FR-002: System can extract nutrition values (calories, protein, carbohydrate, fat, serving size) from a photographed packaged-product nutrition label. Priority: must-have
- FR-003: System can estimate calories and macros for a photographed prepared meal, including an implied portion size, without requiring user input. Priority: must-have
- FR-004: User can optionally provide total meal weight or per-component weights, and the system rescales the estimate accordingly. Priority: must-have
- FR-005: System presents every AI-produced estimate for review before it is committed to the daily log, and allows manual editing of any value. Priority: must-have
- FR-006: System records the source of every entry (label scan, plate photo, free-text, saved meal, manual, exercise estimate). Priority: must-have
- FR-007: System retains the source photo internally as evidence for the estimate, but does not use it as the entry's displayed representation. Priority: must-have
- FR-008: System handles estimation failure gracefully — on an unreadable or unrecognized input it offers manual entry rather than logging a fabricated value. Priority: must-have

### Free-text entry

- FR-080: User can enter a free-text natural-language description of a meal as an alternative to a photo, and the system estimates calories and macros from it. Priority: must-have
- FR-081: System accepts descriptions at any level of detail and uses whatever quantities are stated rather than overriding them with its own assumptions. Priority: must-have
- FR-082: Where a description states no quantity, System assumes a typical portion and makes that assumption visible in the review step so it can be corrected. Priority: must-have
- FR-083: System decomposes a multi-item description into components where the text implies more than one food, so per-component macros and icons are available. Priority: nice-to-have
- FR-084: Free-text estimates pass through the same review-before-commit step as photo estimates and are marked as free-text. Priority: must-have
- FR-085: User can dictate a description by voice, which is transcribed to text before estimation. Priority: nice-to-have
- FR-086: Where a description closely matches an existing saved meal, System surfaces that saved meal as a one-tap alternative instead of running an estimate. Priority: nice-to-have

### Meal representation (icons)

- FR-050: System represents every logged entry with an icon drawn from a fixed, bundled icon set, and does not generate images per meal. Priority: must-have
- FR-051: The icon set is visually consistent (single style, weight, and palette convention), shipped as a static asset with no per-entry runtime cost. Priority: must-have
- FR-052: System assigns an icon automatically by mapping the identified food to a food category, falling back to a generic icon when no category matches. Priority: must-have
- FR-053: User can override the automatically assigned icon. Priority: nice-to-have
- FR-054: Where a meal has a per-component breakdown, each component carries its own icon in addition to the entry-level icon. Priority: nice-to-have
- FR-055: Saved meals store their chosen icon and reuse it on every log. Priority: must-have

### Structured day

- FR-056: System divides every day into five fixed sections in order: breakfast, snack, lunch, bite, supper. Priority: must-have
- FR-057: Each section accepts any number of entries, including zero. Priority: must-have
- FR-058: Every logged entry belongs to exactly one section, defaulting to a section inferred from the time of logging and overridable by the user. Priority: must-have
- FR-059: Each section displays its own subtotal (calories and macros) alongside the day's total. Priority: must-have
- FR-064: User can move an entry between sections after it has been logged. Priority: must-have

### Daily log presentation

- FR-060: System presents the current day as five browsable sections of individual entries, not only as an aggregate daily total. Priority: must-have
- FR-061: Each entry in a section shows its icon, name, and calorie count. Priority: must-have
- FR-062: Selecting an entry opens a detail view showing its full macro breakdown, icon, source marker, and any per-component breakdown with each component's own icon and macro contribution. Priority: must-have
- FR-063: The detail view allows editing, re-sectioning, or deleting the entry, with the section subtotal and daily total recalculating accordingly. Priority: must-have

### Saved meals

- FR-010: User can save any logged meal to a reusable library. Priority: must-have
- FR-011: User can log a saved meal into any day in at most two interactions. Priority: must-have
- FR-012: User can edit and delete saved meals; edits do not retroactively alter already-logged entries. Priority: must-have
- FR-013: User can scale a saved meal by a multiplier at log time (e.g. 0.5x, 2x). Priority: nice-to-have

### Profile & targets

- FR-020: System stores height, current weight, age, sex, activity level, and goal. Priority: must-have
- FR-021: System derives daily calorie and macro targets from the profile. Priority: must-have
- FR-022: User can manually override any derived target. Priority: must-have
- FR-023: User can log body weight over time as its own series. Priority: must-have

### Exercise & expenditure

- FR-070: User can log a training session with type, duration, and intensity. Priority: must-have
- FR-071: User can enter the calorie burn for a logged session directly — typically the value a third-party tracker already computed — rather than the system estimating it (OQ-9). Priority: must-have
- FR-072: User can edit a logged session's burn value after the fact. Priority: must-have
- FR-073: System adds the day's total burned calories to that day's available calorie budget, per the sedentary-baseline model (Model A): resting target plus logged burns. Priority: must-have
- FR-074: User can save frequently repeated sessions for one-tap logging, mirroring the saved-meals mechanism. Priority: nice-to-have
- FR-075: System displays the day as a two-sided ledger: calories in, calories out, and net against budget. Priority: must-have

### Daily log & analytics

- FR-030: System shows a running daily total of calories and macros against the *adjusted* budget, for the current day, on the primary screen. Priority: must-have
- FR-031: User can browse and edit any past day, including its meals and its sessions. Priority: must-have
- FR-032: System shows intake, expenditure, and net trends over selectable ranges (week, month) including moving averages. Priority: must-have
- FR-033: System plots logged body weight against the goal over time. Priority: must-have
- FR-034: System surfaces adherence (days on/over/under budget) as a motivational signal. Priority: must-have

### Platform & access

- FR-040: System runs as a mobile application with camera access. Priority: must-have
- FR-041: System is accessible from a desktop browser against the same data. Priority: must-have
- FR-042: System gates access behind a user-set PIN. Priority: must-have
- FR-043: System synchronises all data so both clients see the same state. Priority: must-have

## Non-Functional Requirements

- Each photographed or typed entry triggers at most one AI estimation; saved-meal and manual entries trigger none. Estimation volume is on the order of a few hundred vision-grade estimations per month.
- Free-text estimation is markedly cheaper than photo estimation, so the product should make the text path at least as fast to reach as the photo path.
- Visual coherence of the day view is delivered at zero marginal per-entry cost — no per-meal generated imagery.
- An entry is never committed with a fabricated value; unrecognized input yields a manual-entry offer, not a guess.
- The owner sees the assumptions behind any estimate (assumed portion, source of the number) before committing it.
- An edit made on one client is reflected on the other so both surfaces show the same state; there is no per-client divergence the owner has to reconcile by hand.
- The owner's food photos and body-weight history stay private and under the owner's control; retained photos are evidence only and never surfaced as an entry's displayed representation.
- No availability guarantee: a backend outage of up to an hour causes no data loss and no broken state on recovery.
- The system carries no throughput or scaling requirement (single user, ~3–8 entries/day); design should optimise for build speed and low running cost, not throughput.

## Business Logic

**One-sentence domain rule:**

> Every logged meal is converted into a calorie/macro estimate — by AI from an image, by AI from a typed description, by recall from the saved-meal library, or by manual override — and is scored against the owner's daily budget, which is derived from his body stats and goal and then adjusted upward by the calories burned in that day's training.

This is not empty CRUD. The non-trivial logic lives in four places. **Estimation with correction:** a first-pass estimate is produced automatically, and any total or per-component weight the owner supplies rescales that estimate rather than replacing it. **Target derivation:** daily calorie and macro targets are computed from height, weight, age, sex, activity level, and goal via a BMR/TDEE-class formula — not typed by hand, though every derived target stays overridable. **Dynamic daily budget:** the day's available calories are not fixed but `derived target + calories burned today`, so a hard training day earns a larger budget and a rest day does not, making the day a genuine two-sided ledger rather than a one-directional intake log. **Trend scoring:** daily *net* totals roll up into moving averages and progress-versus-goal, because single days are noise.

Every entry also carries a confidence/source marker (label scan, plate photo, free-text, saved meal, manual, exercise estimate) reflecting how trustworthy the number is — a printed label is near-exact, a plate photo is grounded in something visible, and a free-text description is the weakest because the only evidence is the words. A logged training burn is owner-entered (OQ-9) — typically copied from a third-party tracker — so it's treated at face value like a manual entry, not as an AI guess. Analytics use this marker to flag periods dominated by low-confidence guesses, so an unexpected trend can be checked against the source mix before anything about the diet is changed.

The expenditure model is resolved (2026-07-19): the system uses the **sedentary baseline (Model A)**. The profile's activity multiplier is fixed at sedentary/BMR, the derived daily target reflects that resting baseline only, and every logged training session adds its logged burn to that day's budget explicitly. The alternative — baking training into the profile's activity multiplier and logging sessions for the record only — was rejected because it double-counts exercise calories. The UI states that the day's budget is a resting baseline plus logged training, so the model is visible to the owner.

## Access Control

Single user — the owner — with no account system, no roles, no sharing, and no social features. Access is gated behind a user-set PIN; there is no email/password, no OAuth, and no password-reset flow. This is an accepted, deliberate weakening of authentication for a single-owner personal tool.

Cloud synchronisation is required because there are two clients (phone and desktop), but there is only ever one identity: storage is a private backend keyed to a single owner, not a per-user auth system. Whether the PIN also gates the desktop client, and whether any recovery path exists if it is forgotten, is unresolved — see Open Questions OQ-8.

## Non-Goals

- **No user accounts, registration, or multi-user support** — single-owner tool; identity is implicit.
- **No social features, sharing, or meal-plan publishing** — nothing here is meant to be seen by anyone but the owner.
- **No barcode lookup** — packaged products are identified from the photographed label only (revisit in OQ-3).
- **No recipe builder / ingredient-level composition editor** — meals are captured and estimated, not authored.
- **No structured workout programming** (sets, reps, progressive overload) — exercise is logged only as an energy-expenditure input, not as a training log.
- **No integration with wearables or third-party health platforms** — burn comes from logged sessions, not synced devices.
- **No offline-first conflict resolution** — offline behaviour is unspecified for the MVP (revisit in OQ-4).
- **No notifications or reminders** — the product does not nag; adherence is driven by the app being pleasant to open.
- **No per-meal AI image generation** — considered and rejected as cost without proportional value; visual identity comes from a bundled icon set.
- **No export beyond a trivial data dump** — this is a personal utility, not a data-portability product.
- **No lab-grade macro precision** — rough-but-consistent estimates are an accepted product stance, not a limitation to engineer away.

## Open Questions

### Resolved
- **OQ-1 — Expenditure model.** ✓ Resolved 2026-07-19 — **Model A (sedentary baseline).** Profile activity multiplier fixed at sedentary/BMR; every logged session adds its burn to the day's budget explicitly. Baked into Business Logic, the Success Criteria guardrail, and FR-073.
- **OQ-5 — Success criteria.** ✓ Resolved 2026-07-19 — **Confirmed as stated.** Both primary criteria (log ≥ 80% of days for 8 consecutive weeks; accept the first estimate without editing in ≥ 70% of entries) are accepted, no longer candidates.
- **OQ-6 — Multi-item plates.** ✓ Resolved 2026-07-28 — **Aggregate only for v1.** One number per plate; a total-weight rescale satisfies FR-004, but per-component decomposition (FR-083), per-component weight correction, and per-component icons (FR-054) are deferred. Unblocks S-04 and S-07, both scoped to the aggregate model.
- **OQ-8 — PIN scope.** ✓ Resolved 2026-07-28 — **Gates both clients.** The PIN is required on mobile and desktop, matching FR-041's full desktop parity. Recovery if forgotten is re-authenticating with the underlying owner Supabase credentials — the PIN is a convenience gate, not the root secret, so no separate recovery flow is needed. Unblocks S-12.
- **OQ-9 — Burn estimation method.** ✓ Resolved 2026-07-28 — **Manual entry, not a computed estimate.** The owner enters a session's calorie burn directly — typically the value a third-party tracker already computed — rather than the system deriving one from a MET table or AI. Consistent with the existing non-goal of no wearable/third-party integration. FR-071 and FR-072 rewritten accordingly. Unblocks S-09.

### Open
1. **OQ-2 — Icon set & taxonomy.** Which icon library or custom set, and how many food categories (starting estimate 25–40) must the taxonomy cover before the generic fallback becomes conspicuous? Owner: user. Block: implementation, not PRD.
2. **OQ-10 — Section defaults.** What time boundaries drive the section inferred in FR-058 (e.g. anything before 10:30 is breakfast)? Should match the owner's actual eating pattern. Owner: user. Block: implementation, not PRD.
3. **OQ-11 — Text ambiguity floor.** How vague is too vague? When confidence is low, should the system push back and ask for a count/size (protects data quality) or silently assume and rely on the review step (protects the minimal-input principle)? Owner: user.
4. **OQ-3 — Barcode.** Many packaged products are easier to identify by barcode than by label reading. Currently a non-goal — confirm, or promote? Owner: user.
5. **OQ-4 — Offline behaviour.** With no connectivity, queue the entry locally and estimate later, or block? Materially affects the sync design. Owner: user.
6. **OQ-7 — Photo retention.** Source photos are evidence-only and never displayed — discard after N days to keep storage flat, or retain indefinitely for possible re-estimation? Owner: user.
7. **OQ-12 — Voice input scope.** FR-085 assumes native on-device dictation (free) rather than a transcription service — confirm, since it affects both cost and offline behaviour. Owner: user.
