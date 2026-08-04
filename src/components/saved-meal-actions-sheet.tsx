// Long-press destination for a saved-meal row (S-08): manage a saved meal via
// "Log to another day…", Edit, or Delete. Built on the shared `Sheet` primitive.
//
// Tapping "Delete" here is itself the confirmation step this slice adds: a
// deliberate, scoped exception to the app's usual "long-press = instant
// delete, no confirm" convention — long-press on this list opens this sheet
// instead of deleting directly.
import { Sheet, SheetOption } from '@/components/ui/sheet';
import type { SavedMeal } from '@/data/types';

export function SavedMealActionsSheet({
  visible,
  savedMeal,
  onEdit,
  onLogToAnotherDay,
  onDelete,
  onRequestClose,
}: {
  visible: boolean;
  savedMeal: SavedMeal | null;
  onEdit: (savedMeal: SavedMeal) => void;
  onLogToAnotherDay: (savedMeal: SavedMeal) => void;
  onDelete: (savedMeal: SavedMeal) => void;
  onRequestClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      title={savedMeal?.name ?? 'Saved meal'}
      subtitle="Saved meal"
      onRequestClose={onRequestClose}>
      <SheetOption
        label="Log to another day…"
        onPress={() => savedMeal && onLogToAnotherDay(savedMeal)}
      />
      <SheetOption label="Edit" onPress={() => savedMeal && onEdit(savedMeal)} />
      <SheetOption
        label="Delete"
        destructive
        onPress={() => savedMeal && onDelete(savedMeal)}
      />
    </Sheet>
  );
}
