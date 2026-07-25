<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Food Icon System (S-05)

- **Plan**: context/changes/food-icon-system/plan.md
- **Scope**: All 4 phases (full plan)
- **Date**: 2026-07-25
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Produce words shadow prepared-dish/drink names in name-derivation

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (correctness)
- **Location**: src/lib/food-emoji.ts:100-115 (fruit block ordered before sweets/drinks)
- **Detail**: The table orders the fruit block (apple, orange, strawberry…) before the sweets and drinks blocks, and `emojiForFood` is first-match-wins. So a compound *name* whose fruit word appears before its dish word resolves to the fruit: "apple pie" → 🍎 (not 🥧), "orange juice" → 🍊 (not 🧃), "strawberry cake" → 🍓 (not 🍰). This is exactly the "specificity ordering is load-bearing" risk the plan flagged. It only bites the **name-derivation** path (manual / unrecognized / legacy entries): recognized entries carry the model's `food_category`, which is the *primary* food ("pie", "juice"), so `iconForEntry` resolves those correctly. Cosmetic, single-user, and the smoke's pinned cases don't include a fruit+dish compound.
- **Fix A ⭐ Recommended**: Move the `pie`, `cake`, and `juice` rules (and add `tart`) ahead of the fruit block so a dish word wins over a bare fruit word; keep bare fruit matches intact.
  - Strength: Fixes the common compounds ("apple pie", "orange juice", "carrot cake") with a small, local reorder; bare "apple"/"orange" still map to fruit.
  - Tradeoff: Reordering has cross-effects — e.g. "fish cake" would then resolve to 🍰 instead of 🐟 — so it trades one rare miss for another.
  - Confidence: MED — verified the common cases by hand, but the table has many interacting tokens.
  - Blind spot: No exhaustive sweep of every fruit+dish combination.
- **Fix B**: Accept as-is; document the name-derivation ordering limitation in the verification Known Gaps.
  - Strength: Zero code churn; recognized entries (the common path) are already correct via `food_category`.
  - Tradeoff: A handful of manually-named compounds show a fruit icon instead of the dish.
  - Confidence: HIGH — the recognized path is unaffected.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — moved pie/cake/juice (+tart) into a "fruit-containing dishes" group placed after proteins/veg but before the fruit block (food-emoji.ts). Verified: apple pie→🥧, orange juice→🧃, strawberry cake→🍰; no regression (fish cake→🐟, carrot cake→🥕, bare fruit intact). tsc/lint/smoke:icon green.

### F2 — Recognized commit can store an empty-string food_category

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(today)/review.tsx:98 (`food_category: recognized ? estimate.food_category : null`)
- **Detail**: The Edge Function's `sanitize` only defaults `food_category` to `'other'` when it is *not a string*; an empty string `''` passes through. On the recognized path this stores `food_category = ''` rather than `null`. Harmless — `iconForEntry` treats `''` like a miss and falls back to the name, then generic — but it's a minor inconsistency (`''` vs `null`) for "no category".
- **Fix**: Normalize empty to null at the call site: `food_category: recognized ? (estimate.food_category || null) : null`.
- **Decision**: FIXED — normalized empty to null at review.tsx:98 (`estimate.food_category || null`). tsc/lint green.
