# Shape Notes — Personal Nutrition Tracker

> Artifact type: `shape-notes.md` (output of a Socratic shaping session, per M1L1 "Od pomysłu do PRD").
> Intended next step: `/10x-prd @context/foundation/shape-notes.md`
> Mode: **greenfield**

---

## 1. Vision & Problem

**Problem.** Logging food in existing diet trackers is manual and slow: search a database, pick the right variant, type grams, repeat per ingredient. The friction is high enough that logging gets abandoned after a few days — which destroys the only thing that makes tracking work: continuity.

**Why now.** Multimodal models can read a nutrition label, estimate a plate of food, and interpret a loose verbal description well enough for the accuracy level actually needed here.

**Three capture paths, one principle.** Photo, free text, and saved meal are alternative front doors to the same estimate-and-log flow. Which one is fastest depends on the situation — a plate in front of you, a meal already eaten and remembered, or a daily repeat — and the app should never force the wrong one.

**Guiding principle (drives every scope decision).** _Minimal manual input._ If a feature adds typing, it needs to justify itself.

**Secondary principle.** _The day should be pleasant to look at, cheaply._ Logging adherence is the real success metric, and an app that looks good is one you keep opening. Visual identity therefore comes from a curated **icon set** — not from per-meal AI image generation, which was considered and rejected as cost without proportional value. The user's own photos are working data (evidence for the estimate), not something anyone wants to browse.

**Explicit accuracy stance.** Rough-but-consistent estimates are acceptable. The owner does not need lab-grade macro precision; he needs a number that is directionally right, every day, without effort. This is a deliberate product decision, not a limitation to be engineered away.

---

## 2. Persona & Access Control

**Single user — the owner.** No multi-tenancy, no roles, no sharing, no social features.

- Adult who cooks/eats a mix of home-prepared meals and packaged products.
- Repeats the same meals often (e.g. a regular protein shake).
- Has a body-composition goal and wants to see whether he is trending toward it.
- Primary device: **phone**. Secondary: **desktop browser**.

**Access control.** A local **PIN** gates the app. No account system, no email/password, no OAuth, no password reset flow.

**Consequence to carry forward:** cloud sync is required (two devices), but there is only ever one identity. Storage is a private backend keyed to a single owner — not a per-user auth system.

---

## 3. MVP Discipline

### In scope (V1)

Eight capabilities. All are load-bearing; dropping any one breaks the "don't waste time" promise or the daily-budget arithmetic.

1. **Label scan** — photo of a packaged product's nutrition label → extract text → log.
2. **Plate estimation** — photo of a prepared meal → AI estimates calories and macros.
3. **Free-text entry** — a typed natural-language description ("three slices of pepperoni pizza") → AI estimates calories and macros, no photo required.
4. **Structured day** — every day is divided into five fixed sections: breakfast, snack 1, lunch, snack 2, supper. Each section holds any number of entries.
5. **Meal list & detail view with icons** — browse the day section by section; open any entry to see its full calorie/macro breakdown. Every meal and every component carries an icon from a fixed set.
6. **Saved meals library** — store frequently eaten meals, log with one tap.
7. **Exercise & energy expenditure** — log training sessions; burned calories adjust the day's available budget.
8. **Profile, targets & analytics** — body stats, derived daily targets, and progress trends over time.

### Non-goals (explicit)

- No user accounts, registration, or multi-user support.
- No social features, sharing, or meal-plan publishing.
- No barcode database lookup (label OCR only — see Open Questions).
- No recipe builder / ingredient-level composition editor.
- No structured workout programming (sets, reps, progressive overload) — exercise is logged only as an energy-expenditure input, not as a training log.
- No integration with wearables, Apple Health, or Google Fit.
- No offline-first conflict resolution (see Open Questions).
- No notifications or reminders.
- No export beyond a trivial data dump.

### Timeline stance — course gate deliberately waived

**This project is not a course deliverable.** It is a personal initiative with no deadline and no external reviewer, and the owner has explicitly chosen product quality over delivery speed.

The gate is therefore recorded as _waived by owner decision_, not as _passed_. Flagging this per the project's own rule about deviating from documented practice — the discipline it enforces (scope honesty) still applies, only the calendar pressure is removed.

What survives from the gate, because it is still useful:

- **Non-goals stay hard.** No deadline is not licence for scope drift; §3 non-goals remain binding.
- **Build order still matters.** The recommended sequence is structured day + manual entry → plate estimation → meal detail & icons → saved meals → exercise → label scan → analytics. The sectioned day comes first because it is the container everything else writes into. Analytics goes last regardless of budget, because it needs accumulated data before it shows anything meaningful.
- **Each slice ships end-to-end.** Per the course's insistence on a working first vertical, each step above should be usable on its own rather than half-built in parallel.

---

## 4. Business Logic

**Core domain rule (one sentence):**

> Every logged meal is converted into a calorie/macro estimate — by AI from an image, by AI from a typed description, by recall from the saved-meal library, or by manual override — and is scored against the owner's daily budget, which is derived from his body stats and goal and then adjusted upward by the calories burned in that day's training.

This is not an empty CRUD. The non-trivial logic lives in four places:

- **Estimation with correction.** The AI produces a first-pass estimate; the owner may supply total meal weight or per-component weights, which rescales the estimate rather than replacing it.
- **Target derivation.** Daily calorie and macro targets are computed from height, weight, age, sex, activity level, and goal (BMR/TDEE-class formula) — not typed in by hand, though they must be overridable.
- **Dynamic daily budget.** The day's available calories are not a fixed number. They are `derived target + calories burned today`. A hard training day earns a larger budget; a rest day does not. This creates a genuine two-sided ledger rather than a one-directional intake log.
- **Trend scoring.** Daily _net_ totals roll up into moving averages and progress-vs-goal, because single days are noise.

**Double-counting hazard — explicit decision required.** The profile's activity level already bakes an assumed exercise load into the derived TDEE. If training is _also_ logged and added on top, the same calories are counted twice. Two mutually exclusive models:

- **Model A — sedentary baseline (recommended).** Set the profile's activity multiplier to sedentary/BMR-only, and let every logged session add its burn explicitly. Cleaner, more honest, requires logging every session.
- **Model B — activity multiplier only.** Bake training into the profile multiplier and log sessions for the record without them affecting the budget.

The system must implement exactly one and say so in the UI. Recorded as OQ-1.

**Confidence handling.** The capture paths are not equally trustworthy. A label scan reads printed values and is near-exact. A plate photo grounds its estimate in something the model can actually see. A free-text description is the weakest of the three, because the model has no evidence beyond the words — "several slices of pizza" carries real ambiguity about size, thickness and toppings, and the model will resolve it by picking a plausible average. An exercise burn estimate is weaker still.

Each entry carries a confidence/source marker (`ai_label`, `ai_plate`, `ai_text`, `saved_meal`, `manual`, `exercise_estimate`) so analytics can flag periods dominated by low-confidence guesses. This is not bookkeeping for its own sake: if a week of "I think I ate roughly..." entries shows an unexpected trend, the source mix is the first thing worth looking at before changing anything about the diet.

---

## 5. Functional Requirements

### Capture & estimation

- **FR-001** — The system shall accept a photo captured in-app or picked from the device gallery as the input to a food log entry.
- **FR-002** — The system shall extract nutrition values (calories, protein, carbohydrate, fat, serving size) from a photographed packaged-product nutrition label.
- **FR-003** — The system shall estimate calories and macros for a photographed prepared meal, including an implied portion size, without requiring user input.
- **FR-004** — The system shall allow the user to optionally provide total meal weight, or per-component weights, and shall rescale the estimate accordingly.
- **FR-005** — The system shall present every AI-produced estimate for review before it is committed to the daily log, and allow manual editing of any value.
- **FR-006** — The system shall record the source of every entry (`ai_plate`, `ai_label`, `ai_text`, `saved_meal`, `manual`).
- **FR-007** — The system shall retain the source photo internally as evidence for the estimate, but shall not use it as the entry's displayed representation (see FR-050).
- **FR-008** — The system shall handle AI failure gracefully: on an unreadable or unrecognized image, it shall offer manual entry rather than logging a fabricated value.

### Free-text entry

- **FR-080** — The system shall accept a free-text natural-language description of a meal as an alternative input to a photo, and estimate calories and macros from it.
- **FR-081** — The system shall accept descriptions at any level of detail, from vague ("a bowl of pasta") to specific ("200 g penne with 100 g tomato sauce and 30 g parmesan"), and shall use whatever quantities are stated rather than overriding them with its own assumptions.
- **FR-082** — Where a description states no quantity, the system shall assume a typical portion, and shall make that assumption visible in the review step so it can be corrected.
- **FR-083** — The system shall decompose a multi-item description into components where the text implies more than one food, so that per-component macros and icons are available.
- **FR-084** — Free-text estimates shall pass through the same review-before-commit step as photo estimates (FR-005) and shall be marked `ai_text` (FR-006).
- **FR-085** — The system shall support dictating a description by voice as an input method for FR-080, transcribing it to text before estimation.
- **FR-086** — Where a description closely matches an existing saved meal, the system shall surface that saved meal as a one-tap alternative instead of running an estimate.

### Meal representation (icons)

- **FR-050** — The system shall represent every logged entry with an icon drawn from a fixed, bundled icon set. The system shall not generate images per meal.
- **FR-051** — The icon set shall be visually consistent (single style, single weight, single palette convention) and shipped as a static asset, incurring no per-entry runtime cost.
- **FR-052** — The system shall assign an icon automatically by mapping the identified food to a food category (e.g. poultry, grain, dairy, fruit, beverage, dessert), falling back to a generic icon when no category matches.
- **FR-053** — The system shall allow the user to override the automatically assigned icon.
- **FR-054** — Where a meal has a per-component breakdown, each component shall carry its own icon in addition to the entry-level icon.
- **FR-055** — Saved meals shall store their chosen icon and reuse it on every log.

### Structured day

- **FR-056** — The system shall divide every day into five fixed sections in this order: breakfast, snack, lunch, bite, supper.
- **FR-057** — Each section shall accept any number of entries, including zero.
- **FR-058** — Every logged entry shall belong to exactly one section, defaulting to a section inferred from the time of logging and overridable by the user.
- **FR-059** — Each section shall display its own subtotal (calories and macros) alongside the day's total.
- **FR-064** — The system shall allow moving an entry between sections after it has been logged.

### Daily log presentation

- **FR-060** — The system shall present the current day as five browsable sections of individual entries, not only as an aggregate daily total.
- **FR-061** — Each entry in a section shall show its icon, name, and calorie count.
- **FR-062** — Selecting an entry shall open a detail view showing its full macro breakdown (protein, carbohydrate, fat), its icon, its source marker, and any per-component breakdown that was captured, with each component's own icon and macro contribution.
- **FR-063** — The detail view shall allow editing, re-sectioning, or deleting the entry, with the section subtotal and daily total recalculating accordingly.

### Saved meals

- **FR-010** — The system shall allow the user to save any logged meal to a reusable library.
- **FR-011** — The system shall allow logging a saved meal into any day in at most two interactions.
- **FR-012** — The system shall allow editing and deleting saved meals; edits shall not retroactively alter already-logged entries.
- **FR-013** — The system shall allow scaling a saved meal by a multiplier at log time (e.g. 0.5x, 2x).

### Profile & targets

- **FR-020** — The system shall store height, current weight, age, sex, activity level, and goal.
- **FR-021** — The system shall derive daily calorie and macro targets from the profile.
- **FR-022** — The system shall allow manual override of any derived target.
- **FR-023** — The system shall allow logging body weight over time as its own series.

### Exercise & expenditure

- **FR-070** — The system shall allow logging a training session with type, duration, and intensity.
- **FR-071** — The system shall estimate calories burned for a logged session from session attributes and the user's body weight, without requiring manual calorie entry.
- **FR-072** — The system shall allow manual override of an estimated burn.
- **FR-073** — The system shall add the day's total burned calories to that day's available calorie budget, per the model selected in OQ-1.
- **FR-074** — The system shall allow saving frequently repeated sessions for one-tap logging, mirroring the saved-meals mechanism.
- **FR-075** — The system shall display the day as a two-sided ledger: calories in, calories out, and net against budget.

### Daily log & analytics

- **FR-030** — The system shall show a running daily total of calories and macros against the _adjusted_ budget, for the current day, on the primary screen.
- **FR-031** — The system shall allow browsing and editing any past day, including its meals and its sessions.
- **FR-032** — The system shall show intake, expenditure, and net trends over selectable ranges (week, month) including moving averages.
- **FR-033** — The system shall plot logged body weight against the goal over time.
- **FR-034** — The system shall surface adherence (days on/over/under budget) as a motivational signal.

### Platform & access

- **FR-040** — The system shall run as a mobile application with native camera access.
- **FR-041** — The system shall be accessible from a desktop browser against the same data.
- **FR-042** — The system shall gate access behind a user-set PIN.
- **FR-043** — The system shall synchronise all data through a cloud backend so both clients see the same state.

---

## 6. User Stories

**US-01 — Log a plate by photo**

> **Given** I am about to eat a home-cooked meal
> **When** I photograph the plate and confirm the estimate
> **Then** the meal's calories and macros are added to today's total, and I see how much of my daily target remains.

**US-02 — Correct a bad estimate with a weight**

> **Given** the app estimated my portion as 300 g but the plate is heavier
> **When** I enter the actual total weight of 450 g
> **Then** the calorie and macro figures rescale proportionally before I commit the entry.

**US-03 — Log a packaged product**

> **Given** I am eating a packaged product with a nutrition label
> **When** I photograph the label and confirm the number of servings or total weight of the package
> **Then** the values from the label are logged without me typing any numbers.

**US-04 — Log a repeat meal instantly**

> **Given** I drink the same protein shake most mornings
> **When** I tap it in my saved meals
> **Then** it is logged to today with no photo and no editing.

**US-05 — Set up targets**

> **Given** I have entered my height, weight, age, sex, activity level and goal
> **When** I open my profile
> **Then** I see derived daily calorie and macro targets that I can adjust manually.

**US-06 — See whether I am on track**

> **Given** I have been logging for several weeks
> **When** I open the analytics view
> **Then** I see my weekly average intake versus target and my body-weight trend against my goal.

**US-07 — Continue on desktop**

> **Given** I logged meals on my phone this morning
> **When** I open the app on my computer
> **Then** today's entries are already there and any edit I make appears on my phone.

**US-08 — Handle a failed recognition**

> **Given** I photograph something the model cannot identify
> **When** the estimate fails
> **Then** I am offered manual entry or a saved-meal pick, and nothing is logged silently.

**US-09 — Inspect a single meal**

> **Given** I have logged several meals today
> **When** I tap one in the day's list
> **Then** I see its full macro breakdown, its icon, its components with their own icons, and how it was estimated — and I can correct it from there.

**US-10 — See my day the way I actually eat it**

> **Given** I have logged across the whole day
> **When** I open today
> **Then** I see breakfast, snack, lunch, bite and dinner as separate sections, each with its own subtotal, so I can tell at a glance where my calories are going.

**US-14 — Log a meal I already ate, from memory**

> **Given** I ate several slices of pizza at lunch and never photographed it
> **When** I type "3 slices of pepperoni pizza" and confirm the estimate
> **Then** it is logged with calories, macros and a pizza icon, with no photo involved.

**US-15 — Add detail when I have it**

> **Given** I know the specifics of what I ate
> **When** I type "200 g penne, 100 g tomato sauce, 30 g parmesan"
> **Then** the estimate uses my stated quantities rather than guessing portions, and each item appears as its own component.

**US-13 — Scan a day at a glance**

> **Given** my day contains a dozen entries
> **When** I look at the list
> **Then** every entry carries a recognisable food icon in one consistent style, so I can parse the day visually without reading every label — and this costs nothing per entry.

**US-11 — Earn back calories from training**

> **Given** I did a hard session this morning
> **When** I log that session
> **Then** my available calories for the day increase by the estimated burn, and I can see intake, expenditure and net side by side.

**US-12 — Log a routine session fast**

> **Given** I do the same gym session most weeks
> **When** I tap it in my saved sessions
> **Then** it is logged with its usual duration and burn, with no typing.

---

## 7. Data Model (sketch)

- **Profile** — height, weight (current), age, sex, activity level, goal, derived targets, target overrides, expenditure model (A or B), PIN hash.
- **WeightEntry** — date, weight.
- **Meal** (logged entry) — date/time, **section** (`breakfast` | `snack_1` | `lunch` | `snack_2` | `supper`), name, calories, protein, carbs, fat, source, confidence, source-photo ref _or_ source-text, icon key, icon overridden (bool), optional declared weight, optional link to SavedMeal, optional multiplier.

  Note that `source-photo ref` and `source-text` are alternatives, not both. The estimate's provenance is one or the other, and the detail view should show whichever exists — the original wording of a text entry is as useful for later correction as the original photo is.

- **MealComponent** — name, estimated weight, macros, icon key. Now first-class rather than optional: the detail view (FR-062) displays it.
- **SavedMeal** — name, per-serving macros, default serving, icon key, default section, created-from ref.
- **FoodCategory → Icon map** — static lookup driving FR-052. Ships with the app; not user data.
- **ExerciseSession** — date/time, type, duration, intensity, estimated burn, override burn, optional link to SavedSession.
- **SavedSession** — name, type, default duration, default intensity.
- **DayBudget** (derived, not stored) — base target + sum of session burns − sum of meal calories = remaining.
- **EstimationRun** (audit) — input (image ref or text), input kind, model used, raw model output, parsed result, user-corrected result. Covers photo estimation, label parsing, free-text estimation, and burn estimation alike.

`EstimationRun` is worth keeping from day one: it is the only way to later evaluate whether estimates are drifting, and it is the raw material for any future prompt tuning.

Note that `section` on `Meal` is a required field, not a tag. Section subtotals (FR-059) are the reason — they must be computable without inference.

---

## 8. Product Framing

- **Type:** personal utility / single-user tool. Not a product to be sold or shared.
- **Scale:** one user, on the order of 3–8 entries per day. No scaling concerns whatsoever. Design decisions should optimise for build speed and low running cost, not throughput.
- **Cost constraint:** one AI call per photographed _or_ typed entry. Text estimation is markedly cheaper than vision — no image tokens — so encouraging the text path is good for both speed and cost. Per-meal image generation was explicitly considered and **rejected** — it roughly doubled running cost for a purely cosmetic gain, and a bundled icon set delivers the same visual coherence at zero marginal cost. Saved meals and manual entries cost nothing at all. Order of magnitude: a few hundred vision calls per month.
- **Storage constraint:** only retained source photos accumulate; icons are static assets. See OQ-7.
- **Privacy:** photos of food and body-weight history are personal. Data lives in a private backend under the owner's control.
- **Availability:** no uptime requirement. If the backend is down for an hour, nothing breaks.

---

## 9. Constraints & Preferences

- **Tech stack: deliberately undecided.** Per M1L1, stack selection is the next lesson's job (`/10x-stack`, M1L2), driven by the PRD rather than by preference. Cross-platform options (React Native, Flutter) and a PWA were mentioned only as context, not chosen.
- **Mobile-first is a hard requirement** — camera capture is the primary interaction. Desktop is read/edit convenience.
- **Cloud sync is a hard requirement** — two clients, one dataset.
- **No real authentication** — PIN only. This is an accepted, deliberate weakening.

---

## 10. Open Questions

- **OQ-1 — Expenditure model.** Model A (sedentary baseline + explicit session burns) or Model B (activity multiplier only)? _Blocks the budget arithmetic; needs an answer before `/10x-prd`._ Recommendation: A.
- **OQ-2 — Icon set & taxonomy.** Which icon library (or custom set), and how many food categories does the taxonomy need to cover before the generic fallback becomes conspicuous? Too coarse and everything is a plate; too fine and the mapping in FR-052 becomes a maintenance burden. A starting estimate is 25–40 categories.
- **OQ-3 — Barcode.** Many packaged products are easier to identify by barcode than by label OCR. Currently a non-goal. Confirm, or promote?
- **OQ-4 — Offline behaviour.** What happens when a photo is taken with no connectivity — queue the entry locally and estimate later, or block? Affects the sync design significantly.
- **OQ-5 — Success criteria.** Candidates: _"I log at least 80% of days for 8 consecutive weeks"_ and _"I accept the AI's first estimate without editing in at least 70% of entries."_ Confirm or replace.
- **OQ-6 — Multi-item plates.** For a plate with several distinct foods, one aggregate number or a per-component breakdown? Per-component enables FR-004's per-item weight correction and makes FR-062's detail view considerably richer, but is materially harder.
- **OQ-7 — Photo retention.** Source photos are evidence-only (FR-007) and never displayed in the list. Discard them after N days to keep storage flat, or retain indefinitely for possible re-estimation?
- **OQ-11 — Text ambiguity floor.** How vague is too vague? "Some pizza" is estimable but with a wide error band. Should the system push back and ask for a count or size when confidence is low, or silently assume and rely on the review step to catch it? The former protects data quality; the latter protects the minimal-input principle. These pull against each other and the tension is worth resolving deliberately.
- **OQ-12 — Voice input scope.** FR-085 assumes on-device dictation (free, native keyboard) rather than a transcription API. Confirm — the distinction matters for both cost and offline behaviour.
- **OQ-10 — Section defaults.** What time boundaries drive the section inferred in FR-058 (e.g. anything before 10:30 is breakfast)? These should match the owner's actual eating pattern rather than a generic assumption.
- **OQ-8 — PIN scope.** Does the PIN gate the desktop client too, and is there any recovery path if it is forgotten?
- **OQ-9 — Burn estimation method.** MET-table lookup from type/duration/weight, or an AI estimate from a free-text session description? The former is deterministic and free; the latter is more convenient and fits the "minimal input" principle.

---

## 11. Closing Soft-Gate (per M1L1)

| #   | Check                      | Status                                             |
| --- | -------------------------- | -------------------------------------------------- |
| 1   | Access control defined     | ✅ PIN, single owner                               |
| 2   | Data model defined         | ✅ sketched, §7                                    |
| 3   | One-sentence business rule | ✅ §4                                              |
| 4   | Project artifacts defined  | ✅ shape-notes → prd → stack → bootstrap           |
| 5   | MVP fits three weeks       | ⚪ **waived** — personal project, no deadline (§3) |
| 6   | Non-goals explicit         | ✅ §3                                              |

**5 passed, 1 waived by owner decision.** Only OQ-1 (expenditure model) genuinely blocks the PRD, since the daily-budget arithmetic depends on it. OQ-2 (icon taxonomy) and OQ-10 (section time boundaries) block implementation but not the PRD. The rest can be carried into the PRD's own `## Open Questions` section.

### Change log

- **Rev 2** — Added exercise logging and the dynamic calorie budget; added the meal detail view; waived the three-weeks timeline gate (personal project, not a course deliverable).
- **Rev 4** — Added free-text meal entry (FR-080–FR-086) as a third capture path alongside photo and saved meals, with voice dictation as an input method and a new `ai_text` source marker. Reworked the confidence discussion, since text is the weakest of the three paths.
- **Rev 3** — **Removed per-meal AI image generation** in favour of a bundled icon set (owner decision: cost without proportional value). Added the five-section structured day (breakfast / snack 1 / lunch / snack 2 / supper) with per-section subtotals. Promoted `MealComponent` to first-class with its own icons.
