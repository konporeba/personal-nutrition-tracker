// A small pill of secondary information: the hero's calorie breakdown, the
// "Estimated" tag on every model-derived value, a section's macro subtotal.
//
// The `accent` tone is load-bearing rather than decorative — it is what marks
// an estimate as provisional (see the review screen), so it must stay visually
// distinct from the neutral `soft` tone at a glance.
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MacroIcon, type Macro } from '@/components/ui/macro-icon';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipTone = 'soft' | 'accent' | 'outline';

export function Chip({
  label,
  tone = 'soft',
  /** A leading icon keying this chip to a macro's identity hue. */
  macro,
  style,
}: {
  label: string;
  tone?: ChipTone;
  macro?: Macro;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();

  return (
    <ThemedView
      type={tone === 'accent' ? 'transparent' : tone === 'soft' ? 'surfaceSoft' : 'transparent'}
      style={[
        styles.chip,
        tone === 'accent' && { backgroundColor: theme.accentSoft },
        tone === 'outline' && { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
        style,
      ]}>
      {macro ? <MacroIcon macro={macro} size={12} /> : null}
      <ThemedText type="micro" themeColor={tone === 'accent' ? 'accentText' : 'textMuted'}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    borderRadius: Radius.pill,
  },
});
