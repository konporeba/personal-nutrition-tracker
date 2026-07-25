# Profile & Derived Targets (S-02) — Plan Brief

> Full plan: `context/changes/profile-and-targets/plan.md`

## What & Why

Give the owner a profile — height, weight, age, sex, activity level, goal — and derive
daily calorie and macro targets from it rather than making the owner type them (FR-020/021).
Every target stays overridable (FR-022) and body weight becomes its own logged series
(FR-023). The payoff: S-01's bare running total on Today becomes *consumed vs target*,
shown as a progress bar for calories and each macro (FR-030). This is the number every
later slice measures against.

## Starting Point

F-01's store and the repo→hook→screen data pattern are proven and shipped; S-01 built the
first UI on top and deliberately kept the tab bar single-tab-but-platform-split so S-02
could add the second tab. There is no profile, no target, and no body-weight series yet —
Today shows an unqualified calorie sum.

## Desired End State

A **Profile** tab shows the owner's stats and current weight, with four derived targets
(calories + three macros) that each can be overridden and reset. Editing a stat re-derives
the targets instantly; an overridden target survives that re-derivation and is marked.
Logging a body weight adds to a history series and re-derives targets, because the series
is the source of truth for "current weight". Back on **Today**, calories and each macro
now read as consumed-of-target with a progress bar.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Override vs re-derivation | Store stats + nullable per-target overrides; derive on read; effective = override ?? derived | Derived is never persisted, so re-derivation structurally cannot clobber an override (the roadmap's named risk) | Plan |
| Calorie derivation | Mifflin-St Jeor BMR × 1.2 (sedentary) × goal factor | Modern standard; sedentary is fixed by Model A so training isn't double-counted | Plan / PRD |
| Goal adjustment | Percentage of maintenance (lose 0.85 / maintain 1.0 / gain 1.10) | Scales proportionally across body sizes; overridable | Plan |
| Macro targets | Protein by body weight (goal-aware g/kg), fat ~27.5% of cals, carbs remainder | Protein tracks the body-composition goal a flat % can't | Plan |
| Current weight | Body-weight series is source of truth; derivation reads the latest reading | One place weight lives; logging a weight re-derives naturally | Plan |
| Activity level | Collected & stored (FR-020) but derivation stays sedentary (Model A) | Honors both the stored-fields requirement and the resolved expenditure model | Plan / PRD |
| Units | Metric only (kg, cm) | Single known owner; zero conversion code | Plan |
| Navigation | A second "Profile" tab (both platform-split files) + a Stack for weight history | The roadmap kept the tab files split precisely for this | Plan / roadmap |
| Today integration | Consumed vs the *resting* target, worded to let S-09 add training later | The dynamic training budget (FR-073) is S-09's slice | Plan / PRD |

## Scope

**In scope:** two new tables (`profile` single-row, `body_weights` series) with RLS + sync
fields; pure `deriveTargets` / `effectiveTargets`; the Profile tab with stats/goal form,
per-target overrides, and weight logging + history; Today's consumed-vs-target progress
bars; `npm run smoke:profile` + verification docs.

**Out of scope:** the dynamic training budget and two-sided ledger (S-09); trends and
weight-vs-goal charts (S-11); the five-section day view (S-06); food icons (S-05); imperial
units; a PIN gate (S-12); any change to the estimate/log loop; adding Jest.

## Architecture / Approach

```
Profile tab (src/app/(profile)/)
  ├─ index.tsx ── useProfile / useTargets ──▶ profile.repo + effectiveTargets
  │                     ▲ upsertProfile (invalidate profile+targets)
  └─ weight.tsx ─ useBodyWeights ──▶ body-weights.repo
                        └─ createBodyWeight → latest reading feeds derivation

deriveTargets(stats, weightKg) ─┐  (pure, src/lib — smoke-importable)
                                ├─▶ effectiveTargets = override ?? derived
profile.*_target_override ──────┘        │
                                         ▼
Today (src/app/(today)/index.tsx) ── useTargets ──▶ DayTotal: consumed (sumCalories/
                                                     sumMacros) vs target, progress bars
```

The **effective target** is the shared seam: Profile, Today, and the smoke all read
`effectiveTargets(profile, latestWeightKg)`, and S-09 later wraps it with the day's burns
without any caller changing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer | `profile` + `body_weights` tables, RLS, types, repos | Getting the single-row profile (PK = owner_id) and sync/trigger template right |
| 2. Derivation core | Pure `deriveTargets` + `effectiveTargets` in `src/lib` | The formula constants and the override-layering being correct and total |
| 3. Profile & weight UI | Profile tab (both tab files + Stack), stats/override form, weight log + history | Both platform-split tab files must change together; override must survive re-derivation in the UI |
| 4. Today integration | Consumed-vs-target progress bars for calories + 3 macros | Div-by-zero / no-target and no-weight fallbacks; keep S-01's per-render day-scoping |
| 5. Verification | `npm run smoke:profile` + docs | Asserting override-survival and latest-weight fallback against the live backend |

**Prerequisites:** F-01 (done); deployed Supabase project + owner creds in `.env.local`; a
device or simulator for Phase 5's manual loop.
**Estimated effort:** ~3–4 sessions across 5 phases.

## Open Risks & Assumptions

- **Formula constants are defaults, not owner-facing knobs.** The goal factors, protein
  g/kg, and fat % are chosen values; the owner tunes via overrides, not by editing the
  formula. If they feel wrong in use, they change in one pure function.
- **"Needs weight" is a real state.** Derivation can't produce a number before the first
  weight is logged; both the Profile screen and Today must degrade gracefully rather than
  divide by zero or show a fabricated target.
- **Today shows the resting budget only.** Until S-09, the bars don't reflect training
  burns; the wording must not imply they do.
- **No component tests.** UI regressions are caught only by manual verification; the smoke
  covers the data + derivation path.

## Success Criteria (Summary)

- The owner enters stats and a weight and sees four derived daily targets, each overridable,
  with overrides surviving any later stat change.
- Body weight is logged as a series, the latest reading drives derivation, and a deleted
  reading falls back to the prior one.
- Today shows consumed vs target for calories and all three macros; `npm run smoke:profile`
  proves derivation, override survival, latest-weight sourcing, and RLS, and exits 0.
