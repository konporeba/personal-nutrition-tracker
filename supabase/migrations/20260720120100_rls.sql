-- F-01 synced-data-backbone — Row Level Security.
--
-- Makes the store private (FR-007): every row is readable/writable only by the
-- authenticated owner, enforced at the database layer — NOT by hiding the anon key
-- (the anon key ships in the client bundle by design; RLS is what keeps data private).
--
-- Single-owner tool: there is effectively one identity, but this is expressed as
-- correct owner-scoped RLS keyed on auth.uid() so it stays correct if that ever changes.
--
-- Perf: auth.uid() is wrapped in (select ...) so it evaluates once per query, not per
-- row (Supabase RLS performance recommendation), and owner_id is indexed (see core schema).

alter table public.estimation_runs enable row level security;
alter table public.meal_entries    enable row level security;

-- estimation_runs -------------------------------------------------------------

create policy estimation_runs_select on public.estimation_runs
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy estimation_runs_insert on public.estimation_runs
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy estimation_runs_update on public.estimation_runs
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy estimation_runs_delete on public.estimation_runs
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- meal_entries ----------------------------------------------------------------
-- Note: soft delete is an UPDATE (set deleted_at); the delete policy exists for
-- completeness / hard-delete maintenance only.

create policy meal_entries_select on public.meal_entries
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy meal_entries_insert on public.meal_entries
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy meal_entries_update on public.meal_entries
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy meal_entries_delete on public.meal_entries
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
