// One row of a section's list: an icon, what was eaten, and what it cost. The
// leading emoji (S-05) is resolved from the entry's stored `food_category`, or
// best-effort from its name, so the day is scannable.
//
// The subtitle carries the log time and, where it says something the time
// doesn't, a tag for where the numbers came from. For anything the model
// produced that tag is a product requirement rather than decoration: an
// estimated value must never present itself as a measured one (FR-005).
//
// Tapping opens the meal detail screen (S-07) — the one place edit, re-section,
// and delete now live. There is no long-press gesture on this row.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ListRow, RowValue } from '@/components/ui/list-row';
import { Spacing } from '@/constants/theme';
import type { EntrySource, MealEntry } from '@/data/types';
import { iconForEntry } from '@/lib/food-emoji';

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The tag each source earns beside the log time, and the weight it carries.
 *
 * `accent` is reserved for the four model-derived sources — that is the FR-005
 * signal, and diluting it across every row would stop it meaning anything.
 * `saved_meal` gets a muted tag instead: worth knowing the row came from the
 * library rather than being typed out again, but its numbers were reviewed and
 * accepted by the owner once already, so it is not a caveat.
 *
 * `manual` is deliberately untagged. The owner typed those numbers themselves;
 * that is the baseline every other tag is a departure *from*, and labelling it
 * would put a word on every row in the day.
 */
const SOURCE_TAG: Record<EntrySource, { label: string; accent: boolean } | null> = {
  label_scan: { label: 'Estimated', accent: true },
  plate_photo: { label: 'Estimated', accent: true },
  free_text: { label: 'Estimated', accent: true },
  exercise_estimate: { label: 'Estimated', accent: true },
  saved_meal: { label: 'Saved', accent: false },
  manual: null,
};

export function MealEntryRow({ entry, onPress }: { entry: MealEntry; onPress?: () => void }) {
  const tag = SOURCE_TAG[entry.source];

  return (
    <ListRow
      icon={iconForEntry(entry)}
      title={entry.name}
      subtitle={
        <ThemedView type="transparent" style={styles.subtitle}>
          <ThemedText type="micro" themeColor="textMuted">
            {timeFormat.format(new Date(entry.logged_at))}
          </ThemedText>
          {tag ? (
            <ThemedText type="micro" themeColor={tag.accent ? 'accentText' : 'textMuted'}>
              · {tag.label}
            </ThemedText>
          ) : null}
        </ThemedView>
      }
      trailing={<RowValue value={entry.calories} />}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
