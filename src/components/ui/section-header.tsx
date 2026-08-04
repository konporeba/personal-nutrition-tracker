// A titled break between blocks of a screen, with an optional trailing action.
// Sentence case, no rules or dividers — the whitespace around it is the divider.
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function SectionHeader({
  title,
  /** Right-hand caption: a running total, a count — anything non-interactive. */
  detail,
  actionLabel,
  onAction,
}: {
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <ThemedView type="transparent" style={styles.row}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {onAction && actionLabel ? (
        <Pressable onPress={onAction} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="linkPrimary">{actionLabel}</ThemedText>
        </Pressable>
      ) : detail ? (
        <ThemedText type="small" themeColor="textMuted">
          {detail}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  pressed: {
    opacity: 0.6,
  },
});
