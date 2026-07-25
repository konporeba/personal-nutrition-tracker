-- S-05 food-icon-system — persist the model's coarse food label on each entry.
--
-- The `estimate` Edge Function already returns a short lowercase `food_category`
-- ("eggs", "pasta", "pizza"…); S-01 dropped it at commit. S-05 stores it so the
-- Today view can resolve a food icon from stored data (mapping category -> emoji
-- at render), with no per-entry runtime cost. Nullable: manual/unrecognized
-- entries carry no category and fall back to a name-derived or generic icon.
--
-- Additive only. No backfill (existing rows stay null and render a name-derived
-- or generic icon), no RLS change (the column inherits the table's policies).

alter table public.meal_entries
  add column food_category text;
