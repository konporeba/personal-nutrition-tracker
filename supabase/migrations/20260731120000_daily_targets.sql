-- S-11 analytics-and-trends — daily_targets schema.
--
-- daily_targets — an immutable per-day snapshot of the effective calorie/macro
-- target (FR-031/032/033/034 need past days judged against the target that was
-- in effect for that day, not whatever the profile says today). A row, once it
-- exists for a given (owner_id, day), is never overwritten — it is written
-- once via an insert-if-absent primitive and read-only after that.
--
-- Shape decisions (see context/changes/analytics-and-trends/plan.md, F1 of the
-- plan review):
--   * `day` is a plain `date`, not a `timestamptz` — the value written is
--     already the resolved local-day key (unlike every other table's
--     `logged_at`/`measured_at` instant), so there is no timezone to reconcile.
--   * The `(owner_id, day)` unique index is intentionally NOT partial (no
--     `where deleted_at is null`). Postgres's `ON CONFLICT` arbiter inference
--     requires an exact match to a non-partial unique index unless the
--     `ON CONFLICT` clause itself repeats the partial predicate, and
--     supabase-js's `onConflict` option has no way to pass a `WHERE`
--     predicate. No phase ever soft-deletes a `daily_targets` row, so a plain
--     index costs nothing and keeps `ensureDailyTarget`'s insert-if-absent
--     upsert working.
--   * Otherwise mirrors training_sessions' shape: uuid pk, owner_id fk,
--     created_at/updated_at (server-set), deleted_at (soft delete, per the
--     F-01 sync backbone, even though nothing sets it), the shared
--     set_updated_at trigger, and four-policy owner-scoped RLS.

create table public.daily_targets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  day        date not null,
  calories   numeric not null,
  protein_g  numeric not null,
  carbs_g    numeric not null,
  fat_g      numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One snapshot per owner per day, and the arbiter `ensureDailyTarget`'s
-- `ON CONFLICT (owner_id, day)` upsert relies on. Also serves range reads
-- (owner_id + day between two bounds) as a leftmost-prefix index.
create unique index daily_targets_owner_day_idx
  on public.daily_targets (owner_id, day);

create trigger daily_targets_set_updated_at
  before update on public.daily_targets
  for each row
  execute function public.set_updated_at();

-- RLS -------------------------------------------------------------------------
-- Same shape as training_sessions: owner-scoped, four policies.

alter table public.daily_targets enable row level security;

create policy daily_targets_select on public.daily_targets
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy daily_targets_insert on public.daily_targets
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy daily_targets_update on public.daily_targets
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy daily_targets_delete on public.daily_targets
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
