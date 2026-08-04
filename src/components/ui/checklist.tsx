// A live requirements list — the small ✓ / ○ column that sits under a form and
// says what still has to be true before the submit button will do anything.
//
// It exists because a button that is disabled for reasons the owner can't see
// reads as broken, not as guarded. Every state carries a glyph as well as a
// color, so the difference between "done" and "still to do" survives without
// color vision.
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';

export type ChecklistState = 'todo' | 'done' | 'warn';
export type ChecklistItem = { label: string; state: ChecklistState };

const MARKS: Record<ChecklistState, { glyph: string; color: ThemeColor }> = {
  todo: { glyph: '○', color: 'textMuted' },
  done: { glyph: '✓', color: 'success' },
  warn: { glyph: '!', color: 'warning' },
};

export function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ThemedView type="transparent" style={styles.list}>
      {items.map((item) => {
        const mark = MARKS[item.state];
        return (
          // The glyph is decoration over the label — a screen reader gets the
          // state from the label's own prefix instead of reading "circle".
          <ThemedView key={item.label} type="transparent" style={styles.row}>
            <ThemedText
              type="micro"
              themeColor={mark.color}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.mark}>
              {mark.glyph}
            </ThemedText>
            <ThemedText
              type="micro"
              themeColor={item.state === 'todo' ? 'textMuted' : 'text'}
              style={styles.label}
              accessibilityLabel={`${item.state === 'done' ? 'Done' : 'To do'}: ${item.label}`}>
              {item.label}
            </ThemedText>
          </ThemedView>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.one + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  mark: {
    // Fixed column so the labels line up whatever glyph precedes them.
    width: 10,
    textAlign: 'center',
  },
  label: {
    flex: 1,
  },
});
