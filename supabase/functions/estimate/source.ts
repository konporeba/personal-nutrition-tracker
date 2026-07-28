// Maps a capture-path input to its FR-006 `entry_source` marker. Centralized so
// later slices (S-03 label scan, S-04 plate photo) extend one place instead of
// threading the mapping through the handler.

import type { EntrySource, EstimateInput } from './types.ts';

export function sourceForInput(input: EstimateInput): EntrySource {
  switch (input.kind) {
    case 'text':
      return 'free_text';
    case 'image':
      // Defaulting to plate_photo for any non-label image keeps the union
      // exhaustive without a third branch — `imageKind` is only ever 'label'
      // or 'plate' per the ImageInput contract.
      return input.imageKind === 'label' ? 'label_scan' : 'plate_photo';
  }
}
