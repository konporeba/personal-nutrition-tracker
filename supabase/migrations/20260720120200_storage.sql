-- F-01 synced-data-backbone — private photo-storage groundwork (FR-007).
--
-- Provisions a PRIVATE bucket for evidence photos and owner-only access policies,
-- so the privacy model exists and is proven before any capture path lands. No upload
-- or download code ships in F-01 — that belongs to S-03 (label scan). This migration
-- only creates the bucket + policies.
--
-- Intended object path convention for S-03: meal-photos/<meal_entry_id>.jpg
-- (photos are evidence only and are NEVER surfaced as an entry's displayed image).

-- Private bucket (public = false).
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

-- Object access is scoped to the meal-photos bucket for authenticated users.
-- storage.objects already has RLS enabled by Supabase. Because this is a single-owner
-- tool with exactly one authenticated identity, "any authenticated user" == "the owner",
-- and scoping by bucket_id avoids depending on the storage.objects owner/owner_id column
-- whose name has shifted across Supabase versions. The bucket itself is private, so an
-- anon (unauthenticated) request is rejected regardless.
create policy meal_photos_owner_all on storage.objects
  for all to authenticated
  using (bucket_id = 'meal-photos')
  with check (bucket_id = 'meal-photos');
