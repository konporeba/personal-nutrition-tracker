// A round icon tile shared by every list row (meal entries, saved meals,
// training sessions) — the one repeating visual unit that ties those three
// lists together as "the same kind of thing" at a glance.
//
// The soft fill is what keeps a dense list scannable: the eye lands on a
// column of discs first and reads the names second.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SIZES = { medium: 44, large: 52 } as const;

export function IconChip({
  icon,
  size = 'medium',
  /** Tint the tile with the accent wash — marks a row as training, not food. */
  accent = false,
}: {
  icon: string;
  size?: keyof typeof SIZES;
  accent?: boolean;
}) {
  const theme = useTheme();
  const dimension = SIZES[size];

  return (
    <ThemedView
      type={accent ? 'transparent' : 'surfaceSoft'}
      style={[
        styles.chip,
        { width: dimension, height: dimension },
        accent && { backgroundColor: theme.accentSoft },
      ]}>
      <ThemedText style={size === 'large' ? styles.iconLarge : styles.icon}>{icon}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
    lineHeight: 26,
  },
  iconLarge: {
    fontSize: 24,
    lineHeight: 30,
  },
});
