// The one row shape in the app. Meal entries, saved meals and training sessions
// are all "an icon, what it was, what it cost", so they share this rather than
// keeping three near-identical copies that drift apart a padding value at a time.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconChip } from '@/components/icon-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function ListRow({
  icon,
  accentIcon = false,
  title,
  subtitle,
  /** The right-hand value. Rendered as-is so a row can put a chip there too. */
  trailing,
  onPress,
  onLongPress,
}: {
  icon: string;
  accentIcon?: boolean;
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type="surface"
        style={[styles.row, { borderColor: theme.border }]}>
        <ThemedView type="transparent" style={styles.left}>
          <IconChip icon={icon} accent={accentIcon} />
          <ThemedView type="transparent" style={styles.textCol}>
            <ThemedText numberOfLines={2}>{title}</ThemedText>
            {subtitle}
          </ThemedView>
        </ThemedView>
        {trailing}
      </ThemedView>
    </Pressable>
  );
}

/** The standard right-hand value: a number and its unit, or a dash when the
 *  value is genuinely unknown. Showing `0` there would read as a real
 *  measurement of nothing, which it isn't. */
export function RowValue({ value, unit = 'kcal' }: { value: number | null; unit?: string }) {
  if (value === null) {
    return <ThemedText themeColor="textMuted">—</ThemedText>;
  }

  return (
    <ThemedView type="transparent" style={styles.value}>
      <ThemedText type="smallBold">{Math.round(value).toLocaleString()}</ThemedText>
      <ThemedText type="micro" themeColor="textMuted">
        {unit}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Radius.card - 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flexShrink: 1,
  },
  textCol: {
    flexShrink: 1,
    gap: 1,
  },
  value: {
    alignItems: 'flex-end',
  },
  pressed: {
    opacity: 0.65,
  },
});
