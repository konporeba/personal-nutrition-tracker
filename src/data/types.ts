// Typed representations of the core-log rows. String-literal unions mirror the
// Postgres enums `entry_section` / `entry_source` (verified against the live
// schema). Timestamps are ISO `timestamptz` strings as returned by supabase-js.
// No component type yet — OQ-6 (per-component plates) is deferred to a later slice.

/** `entry_section` enum — fixed order per FR-056. */
export type Section = 'breakfast' | 'snack' | 'lunch' | 'bite' | 'supper';

/** `entry_source` enum — full FR-006 set; not every capture path exists yet. */
export type EntrySource =
  | 'label_scan'
  | 'plate_photo'
  | 'free_text'
  | 'saved_meal'
  | 'manual'
  | 'exercise_estimate';

/** A row of `public.meal_entries`. */
export type MealEntry = {
  id: string;
  owner_id: string;
  /** The instant the entry counts toward; day-bucketed in the owner's local tz. */
  logged_at: string;
  section: Section;
  source: EntrySource;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  estimation_run_id: string | null;
  created_at: string;
  /** Server-clock, set by a BEFORE UPDATE trigger — the last-write-wins key. */
  updated_at: string;
  /** Non-null once soft-deleted; every read path filters `deleted_at IS NULL`. */
  deleted_at: string | null;
};

/** A row of `public.estimation_runs` — an immutable record of one estimation. */
export type EstimationRun = {
  id: string;
  owner_id: string;
  source: EntrySource;
  input_summary: string | null;
  raw_result: unknown;
  created_at: string;
};

/**
 * Insert input for a new meal entry. `owner_id` is filled by the repo from the
 * session; `id` may be client-supplied for optimistic insert; `created_at` /
 * `updated_at` / `deleted_at` are server-managed.
 */
export type NewMealEntry = {
  id?: string;
  logged_at: string;
  section: Section;
  source: EntrySource;
  name: string;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  estimation_run_id?: string | null;
};

/** Mutable fields for updating a meal entry. */
export type MealEntryPatch = Partial<
  Pick<
    MealEntry,
    | 'logged_at'
    | 'section'
    | 'source'
    | 'name'
    | 'calories'
    | 'protein_g'
    | 'carbs_g'
    | 'fat_g'
    | 'estimation_run_id'
  >
>;

/** Insert input for an estimation run; `owner_id` filled by the repo. */
export type NewEstimationRun = {
  source: EntrySource;
  input_summary?: string | null;
  raw_result?: unknown;
};
