-- S-02 follow-up (impl-review F2): defence-in-depth positivity CHECKs.
--
-- height_cm / age / weight_kg feed target derivation. The Profile and Weight UIs
-- already reject non-positive values, but nothing at the DB stopped a non-UI
-- client (or a future capture path) from persisting a zero/negative value that
-- would then drive a nonsensical target. These constraints enforce it at the
-- source. Added in a separate migration because 20260724120000 is already
-- applied — migrations are immutable once shipped.

alter table public.profile
  add constraint profile_height_cm_positive check (height_cm > 0),
  add constraint profile_age_positive check (age > 0);

alter table public.body_weights
  add constraint body_weights_weight_kg_positive check (weight_kg > 0);
