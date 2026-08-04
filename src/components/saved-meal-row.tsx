// One row of the saved-meals library: an icon, the meal's name, and its
// calories — the same `ListRow` shape a logged entry uses, since a saved meal
// is the same kind of thing one step earlier.
//
// Tap re-logs it to today instantly (S-08, FR-011's ≤2-interaction path).
// Long-press opens the management sheet (Edit / Delete / Log to another day),
// following the same "tap vs long-press, never conflicting" split as
// `MealEntryRow` — RN fires only one of `onPress`/`onLongPress` per touch.
import { ThemedText } from '@/components/themed-text';
import { ListRow, RowValue } from '@/components/ui/list-row';
import type { SavedMeal } from '@/data/types';
import { iconForEntry } from '@/lib/food-emoji';

export function SavedMealRow({
  savedMeal,
  onPress,
  onLongPress,
  /** What tapping this row does *here*. The library logs, the Saved tab edits,
   *  and the row is the only thing that can say which — so the default covers
   *  the library and the other caller passes its own. */
  subtitle = 'Tap to log · hold for options',
}: {
  savedMeal: SavedMeal;
  onPress?: () => void;
  onLongPress?: () => void;
  subtitle?: string;
}) {
  return (
    <ListRow
      icon={iconForEntry(savedMeal)}
      title={savedMeal.name}
      subtitle={
        <ThemedText type="micro" themeColor="textMuted">
          {subtitle}
        </ThemedText>
      }
      trailing={<RowValue value={savedMeal.calories} />}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
}
