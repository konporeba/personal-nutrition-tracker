// Request/response contract for the `estimate` Edge Function (F-02).
//
// This is the Deno-side copy of the contract. The client keeps its own copy in
// `src/data/estimation-types.ts` (Phase 3) — Deno and the RN/Expo build do not
// share a module graph, so the shape is declared twice and kept in sync by the
// Phase-4 smoke test, which exercises the real wire shape end-to-end.

/** How sure the model is about the estimate. */
export type Confidence = 'low' | 'medium' | 'high';

/**
 * `entry_source` enum (FR-006 source marker). Deno-local mirror of the Postgres
 * enum defined in the core-log migration; not every value is produced yet.
 */
export type EntrySource =
  | 'label_scan'
  | 'plate_photo'
  | 'free_text'
  | 'saved_meal'
  | 'manual'
  | 'exercise_estimate';

/**
 * A single, aggregate estimate for one meal. Macro fields are `null` when the
 * input was not a recognizable food (`recognized: false`) — the proxy never
 * fabricates a number (FR-008).
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
};

/** Free-text capture path (S-01). */
export type TextInput = { kind: 'text'; text: string };

/**
 * Photo capture path — reserved for S-03 (label scan) / S-04 (plate photo).
 * Declared now so later slices add a variant without a breaking contract change;
 * the function rejects it as unsupported until then.
 */
export type ImageInput = { kind: 'image'; mediaType?: string; data?: string };

/** Discriminated union of every capture path. Extend, don't replace. */
export type EstimateInput = TextInput | ImageInput;

export type EstimateRequest = { input: EstimateInput };

/**
 * Full response contract. Phase 1 returns only `estimate`; `runId` is added in
 * Phase 2 once the EstimationRun is recorded server-side.
 */
export type EstimateResponse = { runId: string; estimate: Estimate };
