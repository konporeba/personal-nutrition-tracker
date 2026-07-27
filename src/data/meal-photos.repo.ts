// Evidence-photo upload for label scans (S-03). The only storage write this
// slice owns — the `meal-photos` private bucket + owner RLS already exist
// (F-01, `supabase/migrations/20260720120200_storage.sql`), keyed by
// `<meal_entry_id>.jpg`. Photos are evidence only and are never displayed.
import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

/** Upload a captured label photo as `<mealEntryId>.jpg`. Throws on failure. */
export async function uploadMealPhoto(mealEntryId: string, base64Jpeg: string): Promise<void> {
  const { error } = await supabase.storage
    .from('meal-photos')
    .upload(`${mealEntryId}.jpg`, decode(base64Jpeg), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;
}
