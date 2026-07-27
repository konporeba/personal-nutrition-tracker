// Client-side copy of the `estimate` Edge Function contract (F-02).
//
// The function keeps its own Deno copy in `supabase/functions/estimate/types.ts`
// — Deno and the RN/Expo build do not share a module graph, so the shape is
// declared twice and kept in sync by the Phase-4 smoke test, which exercises the
// real wire shape end-to-end. Change one side, change the other.

/** How sure the model is about the estimate. */
export type Confidence = 'low' | 'medium' | 'high';

/**
 * A single, aggregate estimate for one meal. Macro fields are `null` when the
 * input was not a recognizable food (`recognized: false`) — the proxy never
 * fabricates a number (FR-008). Field names match `MealEntry` in `@/data/types`
 * so a reviewed estimate maps onto a `NewMealEntry` without renaming (S-01).
 *
 * For a label-scan estimate (S-03), the macro fields and `serving_size` are
 * **per serving** — review multiplies by the owner-confirmed servings count
 * before committing totals to `meal_entries`.
 */
export type Estimate = {
  /** Short human name for the meal, e.g. "Scrambled eggs and toast". */
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  /** Coarse category label for the primary food (S-05 maps this to an icon). */
  food_category: string;
  /** Portion/identity assumptions the model made, surfaced for review (FR-082). */
  assumptions: string[];
  /** False when the text was not an identifiable food; macros are then null. */
  recognized: boolean;
  confidence: Confidence;
  /**
   * Label-scan only (S-03): the printed serving size (e.g. "30 g", "1 cup").
   * `null` for text/plate estimates and when a label had no legible serving size.
   */
  serving_size: string | null;
};

/** Free-text capture path (S-01). */
export type TextInput = { kind: 'text'; text: string };

/**
 * Photo capture path — `label` (S-03) and `plate` (S-04) share the wire shape;
 * `sourceForInput` maps `imageKind` onto the `label_scan` / `plate_photo` entry
 * source. The function rejects `imageKind: 'plate'` as unsupported until S-04.
 */
export type ImageInput = {
  kind: 'image';
  imageKind: 'label' | 'plate';
  mediaType?: string;
  data?: string;
};

/** Discriminated union of every capture path. Extend, don't replace. */
export type EstimateInput = TextInput | ImageInput;

export type EstimateRequest = { input: EstimateInput };

/** Full response contract: the recorded run's id plus the estimate to review. */
export type EstimateResponse = { runId: string; estimate: Estimate };
