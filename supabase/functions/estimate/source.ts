// Maps a capture-path input to its FR-006 `entry_source` marker. Centralized so
// later slices (S-03 label scan, S-04 plate photo) extend one place instead of
// threading the mapping through the handler.

import type { EntrySource, EstimateInput } from './types.ts';

export function sourceForInput(input: EstimateInput): EntrySource {
  switch (input.kind) {
    case 'text':
      return 'free_text';
    case 'image':
      // Reserved for S-03/S-04; the handler rejects image input until then, so
      // this branch is unreachable today. Defaulting keeps the union exhaustive.
      return 'plate_photo';
  }
}
