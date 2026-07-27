-- S-08 saved-meals-library — reusable saved meals.
--
-- Mirrors meal_entries' schema/RLS pattern exactly: uuid pk, owner_id fk,
-- created_at/updated_at (shared set_updated_at() trigger)/deleted_at sync
-- fields, partial index on live rows, four-policy owner-scoped RLS.
--
-- No log-specific columns (logged_at/section/source/estimation_run_id) — a
-- saved meal isn't a log entry, it's the reusable template a log entry gets
-- copied from at re-log time (copy-on-log, no FK back to this table).

create table public.saved_meals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  name          text not null,
  calories      numeric,
  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  food_category text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Library read has no date range — index owner scoping only, over live rows.
create index saved_meals_owner_id_idx
  on public.saved_meals (owner_id)
  where deleted_at is null;

create trigger saved_meals_set_updated_at
  before update on public.saved_meals
  for each row
  execute function public.set_updated_at();

-- RLS -------------------------------------------------------------------------
-- Same shape as meal_entries: soft delete is an UPDATE (set deleted_at); the
-- delete policy exists for completeness / hard-delete maintenance only.

alter table public.saved_meals enable row level security;

create policy saved_meals_select on public.saved_meals
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy saved_meals_insert on public.saved_meals
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy saved_meals_update on public.saved_meals
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy saved_meals_delete on public.saved_meals
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
