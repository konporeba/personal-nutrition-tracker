-- S-11 analytics-and-trends — profile.target_weight_kg.
--
-- FR-033's Weight-vs-Goal panel needs a concrete number to plot a reference
-- line against; `profile.goal` (lose/maintain/gain) is directional only. This
-- mirrors the existing `*_target_override` columns: an optional, owner-set
-- value layered on top, null meaning "no goal set yet". Additive/nullable, so
-- no backfill is needed.

alter table public.profile
  add column target_weight_kg numeric,
  add constraint profile_target_weight_kg_positive
    check (target_weight_kg is null or target_weight_kg > 0);
