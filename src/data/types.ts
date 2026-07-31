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
  /** Coarse food label from the estimate (S-05), mapped to an icon at render. */
  food_category: string | null;
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
  food_category?: string | null;
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
    | 'food_category'
    | 'estimation_run_id'
  >
>;

/** Insert input for an estimation run; `owner_id` filled by the repo. */
export type NewEstimationRun = {
  source: EntrySource;
  input_summary?: string | null;
  raw_result?: unknown;
};

/**
 * A row of `public.saved_meals` (S-08) — a reusable template a `MealEntry` gets
 * copied from at re-log time. No log-specific fields (no `logged_at`/`section`/
 * `source`), and no FK back from `meal_entries`: copy-on-log means an edit here
 * never retroactively changes an entry already logged from it.
 */
export type SavedMeal = {
  id: string;
  owner_id: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  /** Same free-text category as `MealEntry.food_category`, resolved to an icon via `iconForEntry`. */
  food_category: string | null;
  created_at: string;
  /** Server-clock, set by a BEFORE UPDATE trigger — the last-write-wins key. */
  updated_at: string;
  /** Non-null once soft-deleted; every read path filters `deleted_at IS NULL`. */
  deleted_at: string | null;
};

/**
 * Insert input for a new saved meal. `owner_id` is filled by the repo from the
 * session; `id` may be client-supplied for optimistic insert; `created_at` /
 * `updated_at` / `deleted_at` are server-managed.
 */
export type NewSavedMeal = {
  id?: string;
  name: string;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  food_category?: string | null;
};

/** Mutable fields for updating a saved meal. */
export type SavedMealPatch = Partial<
  Pick<SavedMeal, 'name' | 'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'food_category'>
>;

// Profile & body-weight rows (S-02). String-literal unions mirror the Postgres
// enums `activity_level` / `body_goal` / `body_sex`.

/** `activity_level` enum (FR-020). Stored but NOT used in derivation (Model A). */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/** `body_goal` enum (FR-021) — drives the goal factor in derivation. */
export type BodyGoal = 'lose' | 'maintain' | 'gain';

/** `body_sex` enum — the BMR term needs exactly these two. */
export type Sex = 'male' | 'female';

/**
 * A row of `public.profile` — the single owner's stats, goal, and per-target
 * overrides. No weight column: current weight comes from `body_weights`. Each
 * `*_target_override` is non-null only when the owner has explicitly overridden
 * that target; derived values are never stored.
 */
export type Profile = {
  owner_id: string;
  height_cm: number;
  age: number;
  sex: Sex;
  activity_level: ActivityLevel;
  goal: BodyGoal;
  calorie_target_override: number | null;
  protein_target_override: number | null;
  carb_target_override: number | null;
  fat_target_override: number | null;
  /** Numeric weight goal (S-11 FR-033) — null when the owner hasn't set one. */
  target_weight_kg: number | null;
  created_at: string;
  /** Server-clock, set by a BEFORE UPDATE trigger — the last-write-wins key. */
  updated_at: string;
  /** Non-null once soft-deleted; every read path filters `deleted_at IS NULL`. */
  deleted_at: string | null;
};

/**
 * Upsert input for the profile. `owner_id` is filled by the repo from the
 * session; `created_at` / `updated_at` / `deleted_at` are server-managed. The
 * five stats plus the four nullable overrides. Passing `null` for an override
 * resets that target back to derived.
 */
export type NewProfile = {
  height_cm: number;
  age: number;
  sex: Sex;
  activity_level: ActivityLevel;
  goal: BodyGoal;
  calorie_target_override?: number | null;
  protein_target_override?: number | null;
  carb_target_override?: number | null;
  fat_target_override?: number | null;
  target_weight_kg?: number | null;
};

/**
 * Upsert input for the profile. The repo upserts on the `owner_id` PK, and
 * Postgres validates the INSERT tuple *before* the ON CONFLICT update resolves,
 * so every write MUST carry the five NOT NULL stats — a stats-less patch throws
 * at runtime. The type therefore requires them (not `Partial`). Overrides are
 * optional: pass `null` to reset a target back to derived, or omit a column to
 * leave it unchanged.
 */
export type ProfilePatch = Pick<
  Profile,
  'height_cm' | 'age' | 'sex' | 'activity_level' | 'goal'
> & {
  calorie_target_override?: number | null;
  protein_target_override?: number | null;
  carb_target_override?: number | null;
  fat_target_override?: number | null;
  target_weight_kg?: number | null;
};

// Training-session rows (S-09). String-literal union mirrors the Postgres enum
// `training_intensity`.

/** `training_intensity` enum. */
export type TrainingIntensity = 'low' | 'moderate' | 'high';

/**
 * A row of `public.training_sessions`. No section/source columns — a session
 * isn't a meal (no section) and its burn is always owner-entered, never
 * AI-estimated (OQ-9), so there's no confidence/source marker to carry.
 */
export type TrainingSession = {
  id: string;
  owner_id: string;
  /** The instant the session counts toward; day-bucketed in the owner's local tz. */
  logged_at: string;
  session_type: string;
  intensity: TrainingIntensity;
  duration_minutes: number;
  burn_kcal: number;
  created_at: string;
  /** Server-clock, set by a BEFORE UPDATE trigger — the last-write-wins key. */
  updated_at: string;
  /** Non-null once soft-deleted; every read path filters `deleted_at IS NULL`. */
  deleted_at: string | null;
};

/**
 * Insert input for a new training session. `owner_id` is filled by the repo
 * from the session; `id` may be client-supplied for optimistic insert;
 * `created_at` / `updated_at` / `deleted_at` are server-managed.
 */
export type NewTrainingSession = {
  id?: string;
  logged_at: string;
  session_type: string;
  intensity: TrainingIntensity;
  duration_minutes: number;
  burn_kcal: number;
};

/** Mutable fields for updating a training session. */
export type TrainingSessionPatch = Partial<
  Pick<
    TrainingSession,
    'logged_at' | 'session_type' | 'intensity' | 'duration_minutes' | 'burn_kcal'
  >
>;

/** A row of `public.body_weights` — one logged reading in the series. */
export type BodyWeight = {
  id: string;
  owner_id: string;
  weight_kg: number;
  measured_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

/**
 * Insert input for a body-weight reading. `owner_id` filled by the repo; `id`
 * may be client-supplied for optimistic insert; sync fields are server-managed.
 */
export type NewBodyWeight = {
  id?: string;
  weight_kg: number;
  measured_at: string;
};

// Daily-target snapshot rows (S-11). Immutable per-day snapshot of the
// effective target — written once via an insert-if-absent primitive, never
// updated after.

/**
 * A row of `public.daily_targets` — the target snapshot in effect the first
 * time a given local day was touched by a write or an analytics read.
 */
export type DailyTarget = {
  id: string;
  owner_id: string;
  /** Local calendar day this snapshot answers for, `YYYY-MM-DD`. */
  day: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
