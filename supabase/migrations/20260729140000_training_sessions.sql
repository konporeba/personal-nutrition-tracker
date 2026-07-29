-- S-09 training-and-dynamic-budget — training-sessions schema.
--
-- training_sessions — a logged training session (FR-070/071/072): type,
-- intensity, duration, and an owner-entered calorie burn (OQ-9 resolved: no
-- MET table, no AI estimate). Mirrors meal_entries' log-entry shape (surrogate
-- uuid pk + owner_id fk), not profile's singleton shape, since this is a log,
-- not a single-row-per-owner table.
--
-- Shape decisions (see context/changes/training-and-dynamic-budget/plan.md):
--   * No section/source columns — sessions don't belong to a meal section, and
--     burn is always owner-entered (never AI-estimated), so there's no
--     confidence/source marker to record.
--   * Positivity checks (duration_minutes > 0, burn_kcal > 0) go directly in
--     this migration since the table is brand new — no follow-up migration
--     needed (unlike 20260725120000, which patched an already-shipped table).
--   * Same F-01 sync backbone as every other table: uuid pk, created_at/
--     updated_at (server-set), deleted_at (soft delete), the shared
--     set_updated_at trigger, and four-policy owner-scoped RLS.

-- Enums -----------------------------------------------------------------------

create type public.training_intensity as enum (
  'low', 'moderate', 'high'
);

-- training_sessions -------------------------------------------------------------

create table public.training_sessions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  logged_at        timestamptz not null,
  session_type     text not null,
  intensity        public.training_intensity not null,
  duration_minutes int not null,
  burn_kcal        numeric not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint training_sessions_duration_minutes_positive check (duration_minutes > 0),
  constraint training_sessions_burn_kcal_positive check (burn_kcal > 0)
);

-- Day queries: owner + logged_at range over live (non-deleted) rows, same
-- shape as meal_entries_owner_logged_at_idx. Partial on deleted_at is null so
-- the common query stays tight; queries MUST include `deleted_at is null` to
-- use it (the repo always does).
create index training_sessions_owner_logged_at_idx
  on public.training_sessions (owner_id, logged_at)
  where deleted_at is null;

create trigger training_sessions_set_updated_at
  before update on public.training_sessions
  for each row
  execute function public.set_updated_at();

-- RLS -------------------------------------------------------------------------
-- Same shape as meal_entries/saved_meals: soft delete is an UPDATE (set
-- deleted_at); the delete policy exists for completeness / hard-delete
-- maintenance only.

alter table public.training_sessions enable row level security;

create policy training_sessions_select on public.training_sessions
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy training_sessions_insert on public.training_sessions
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy training_sessions_update on public.training_sessions
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy training_sessions_delete on public.training_sessions
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
