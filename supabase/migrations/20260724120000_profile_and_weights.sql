-- S-02 profile-and-targets — profile + body-weight series schema.
--
-- Two tables:
--   profile       — the single owner's stats, goal, and per-target overrides
--                   (PK = owner_id enforces the single row). No weight column —
--                   current weight comes from body_weights (the series is the
--                   source of truth for "current weight").
--   body_weights  — the logged body-weight series (FR-023); latest reading feeds
--                   target derivation.
--
-- Shape decisions (see context/changes/profile-and-targets/plan.md):
--   * Model A / sedentary baseline (OQ-1): activity_level is stored (FR-020) but
--     does NOT feed derivation — derivation is fixed at sedentary. The column
--     exists for display and future use.
--   * Override semantics (the named risk): the four *_target_override columns are
--     nullable and hold ONLY explicit overrides. Derived targets are never stored;
--     they are computed at read time. Re-derivation therefore cannot clobber an
--     override — the DB never carries a derived value.
--   * Same F-01 sync backbone as the core log: uuid pk, created_at/updated_at
--     (server-set), deleted_at (soft delete), and the set_updated_at trigger.

-- Enums -----------------------------------------------------------------------

-- Activity level (FR-020). Stored for display; NOT used in derivation (Model A).
create type public.activity_level as enum (
  'sedentary', 'light', 'moderate', 'active', 'very_active'
);

-- Body goal (FR-021) — drives the goal factor in derivation.
create type public.body_goal as enum (
  'lose', 'maintain', 'gain'
);

-- Biological sex — the BMR term needs exactly these two (Mifflin-St Jeor).
create type public.body_sex as enum (
  'male', 'female'
);

-- profile ---------------------------------------------------------------------

create table public.profile (
  owner_id                uuid primary key references auth.users (id) on delete cascade,
  height_cm               numeric not null,
  age                     int not null,
  sex                     public.body_sex not null,
  activity_level          public.activity_level not null,
  goal                    public.body_goal not null,
  -- Nullable overrides (FR-022): non-null only when the owner has explicitly
  -- overridden that target. Derived values are never written here.
  calorie_target_override numeric,
  protein_target_override numeric,
  carb_target_override    numeric,
  fat_target_override     numeric,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create trigger profile_set_updated_at
  before update on public.profile
  for each row
  execute function public.set_updated_at();

-- body_weights ----------------------------------------------------------------

create table public.body_weights (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  weight_kg   numeric not null,
  measured_at timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Latest-reading read: owner + measured_at over live rows. Partial on
-- deleted_at is null so the common query stays tight; reads MUST include
-- `deleted_at is null` to use it (the repo always does).
create index body_weights_owner_measured_at_idx
  on public.body_weights (owner_id, measured_at)
  where deleted_at is null;

create trigger body_weights_set_updated_at
  before update on public.body_weights
  for each row
  execute function public.set_updated_at();

-- RLS -------------------------------------------------------------------------
-- Owner-scoped, mirroring 20260720120100_rls.sql: four policies per table, each
-- `to authenticated` with the (select auth.uid()) wrapper (evaluates once per
-- query, not per row). Soft delete is an UPDATE; the delete policy exists for
-- completeness / hard-delete maintenance only.

alter table public.profile      enable row level security;
alter table public.body_weights enable row level security;

-- profile ---------------------------------------------------------------------

create policy profile_select on public.profile
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy profile_insert on public.profile
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy profile_update on public.profile
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy profile_delete on public.profile
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- body_weights ----------------------------------------------------------------

create policy body_weights_select on public.body_weights
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy body_weights_insert on public.body_weights
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy body_weights_update on public.body_weights
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy body_weights_delete on public.body_weights
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
