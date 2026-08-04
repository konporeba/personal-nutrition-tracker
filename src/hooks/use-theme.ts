/**
 * The active color set. Every component reads its colors from here — see the
 * no-hardcoded-colors rule in `constants/theme.ts`. The app is dark-only, so
 * this always resolves to the one palette.
 */

import { Colors } from '@/constants/theme';

export function useTheme() {
  return Colors;
}
