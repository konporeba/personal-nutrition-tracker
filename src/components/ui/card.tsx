// The app's defining shape: a large, soft-cornered panel on the page canvas.
// Everything that groups related information sits in one of these, so the
// radius and padding live here and nowhere else.
import { StyleSheet } from 'react-native';

import { ThemedView, type ThemedViewProps } from '@/components/themed-view';
import { cardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardProps = ThemedViewProps & {
  /** `soft` is the recessed variant — a card nested inside another card. */
  tone?: 'surface' | 'soft';
  /** Drop the built-in padding when the content manages its own (e.g. a list). */
  padded?: boolean;
  /** Elevation reads as noise on the already-recessed `soft` tone. */
  elevated?: boolean;
};

export function Card({
  tone = 'surface',
  padded = true,
  elevated = true,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  return (
    <ThemedView
      type={tone === 'soft' ? 'surfaceSoft' : 'surface'}
      style={[
        styles.card,
        { borderColor: theme.border },
        padded && styles.padded,
        elevated && tone === 'surface' && cardShadow(theme.shadow),
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: {
    padding: Spacing.four,
  },
});
