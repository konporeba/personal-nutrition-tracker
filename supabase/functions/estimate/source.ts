// Maps a capture-path input to its FR-006 `entry_source` marker. Centralized so
// later slices (S-03 label scan, S-04 plate photo) extend one place instead of
// threading the mapping through the handler.

import type { EntrySource, EstimateInput } from './types.ts';

export function sourceForInput(input: EstimateInput): EntrySource {
  switch (input.kind) {
    case 'text':
      return 'free_text';
    case 'image':
      switch (input.imageKind) {
        case 'label':
          return 'label_scan';
        case 'plate':
          return 'plate_photo';
        default: {
          // Exhaustiveness check: a future third `imageKind` fails to
          // compile here instead of silently falling through to a wrong
          // source marker.
          const _exhaustive: never = input.imageKind;
          throw new Error(`unhandled imageKind: ${_exhaustive}`);
        }
      }
  }
}
