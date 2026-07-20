-- F-01 synced-data-backbone — core log schema.
--
-- Two tables:
--   estimation_runs — an immutable record of one AI estimation (F-02 writes these).
--   meal_entries    — the logged entry the day view reads.
--
-- Shape decisions (see context/changes/synced-data-backbone/plan.md):
--   * Minimal "core log only" — profile/exercise/saved-meal tables arrive in their
--     own slices via their own migrations.
--   * OQ-6 flat: meal_entries carries aggregate macros; a per-component table can be
--     added later additively without touching this one.
--   * Two-client sync metadata on meal_entries: uuid pk (client may supply for
--     optimistic insert), created_at/updated_at (server-set), deleted_at (soft delete).
--   * Day-boundary convention (F3): logged_at is an absolute instant (timestamptz);
--     "the day" an entry belongs to is defined in the OWNER'S LOCAL TIMEZONE and is
--     computed client-side into a [start, end) UTC range for queries. The DB stays
--     timezone-agnostic.

-- Enums -----------------------------------------------------------------------

-- Fixed five-section day, in order (FR-056).
create type public.entry_section as enum (
  'breakfast', 'snack', 'lunch', 'bite', 'supper'
);

-- Source / confidence marker for every entry (FR-006). Full set defined now even
-- though only some capture paths exist yet.
create type public.entry_source as enum (
  'label_scan', 'plate_photo', 'free_text', 'saved_meal', 'manual', 'exercise_estimate'
);

-- updated_at trigger ----------------------------------------------------------

-- Server-clock updated_at so last-write-wins ordering can't be corrupted by
-- device clock skew. search_path pinned per Supabase security lint.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- estimation_runs -------------------------------------------------------------

create table public.estimation_runs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  source        public.entry_source not null,
  input_summary text,
  raw_result    jsonb,
  created_at    timestamptz not null default now()
);

-- Owner scoping is used by RLS and by every read.
create index estimation_runs_owner_id_idx on public.estimation_runs (owner_id);

-- meal_entries ----------------------------------------------------------------

create table public.meal_entries (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  logged_at         timestamptz not null,
  section           public.entry_section not null,
  source            public.entry_source not null,
  name              text not null,
  calories          numeric,
  protein_g         numeric,
  carbs_g           numeric,
  fat_g             numeric,
  estimation_run_id uuid references public.estimation_runs (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Day queries: owner + logged_at range over live (non-deleted) rows.
-- Partial on deleted_at is null so the common query stays tight; queries MUST
-- include `deleted_at is null` to use it (the repo always does).
create index meal_entries_owner_logged_at_idx
  on public.meal_entries (owner_id, logged_at)
  where deleted_at is null;

-- FK index for the estimation_run relationship.
create index meal_entries_estimation_run_id_idx
  on public.meal_entries (estimation_run_id);

create trigger meal_entries_set_updated_at
  before update on public.meal_entries
  for each row
  execute function public.set_updated_at();
