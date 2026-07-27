// Long-press destination for a saved-meal row (S-08): manage a saved meal via
// "Log to another day…", Edit, or Delete. Built on RN's Modal — no new
// dependency, matching the project's home-grown-theming stance (no component
// library), same structure as `MoveSectionSheet`.
//
// Tapping "Delete" here is itself the confirmation step this slice adds: a
// deliberate, scoped exception to the app's usual "long-press = instant
// delete, no confirm" convention — long-press on this list opens this sheet
// instead of deleting directly.
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable onPress={() => {}}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
              <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
                {savedMeal?.name ?? 'Saved meal'}
              </ThemedText>
              <Option
                label="Log to another day…"
                onPress={() => savedMeal && onLogToAnotherDay(savedMeal)}
              />
              <Option label="Edit" onPress={() => savedMeal && onEdit(savedMeal)} />
              <Option label="Delete" onPress={() => savedMeal && onDelete(savedMeal)} />
              <Pressable
                onPress={onRequestClose}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView style={styles.cancel}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    Cancel
                  </ThemedText>
                </ThemedView>
              </Pressable>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.option}>
        <ThemedText>{label}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    padding: Spacing.four,
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
  },
  sheetInner: {
    gap: Spacing.two,
  },
  title: {
    paddingBottom: Spacing.one,
  },
  option: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
