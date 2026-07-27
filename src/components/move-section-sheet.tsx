// "Move to…" sheet (S-06, FR-064): tapping a logged entry opens this to
// re-section it. RN's built-in Modal — no new dependency, matching the
// project's home-grown-theming stance (no component library).
import { Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SECTION_LABELS } from '@/components/section-subtotal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Section } from '@/data/types';
import { SECTION_ORDER } from '@/lib/group-by-section';

export function MoveSectionSheet({
  visible,
  currentSection,
  onSelect,
  onRequestClose,
}: {
  visible: boolean;
  currentSection: Section;
  onSelect: (section: Section) => void;
  onRequestClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable onPress={() => {}}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            {/* Bottom-only: the sheet already pads its other edges via
                `styles.sheet`; this just keeps Cancel clear of a home
                indicator/gesture bar, the same inset the main list applies. */}
            <SafeAreaView edges={['bottom']} style={styles.sheetInner}>
              <ThemedText type="smallBold" style={styles.title}>
                Move to…
              </ThemedText>
              {SECTION_ORDER.map((section) => {
                const isCurrent = section === currentSection;
                return (
                  <Pressable
                    key={section}
                    disabled={isCurrent}
                    onPress={() => onSelect(section)}
                    style={({ pressed }) => pressed && !isCurrent && styles.pressed}>
                    <ThemedView
                      type={isCurrent ? 'backgroundSelected' : 'backgroundElement'}
                      style={styles.option}>
                      <ThemedText themeColor={isCurrent ? 'textSecondary' : 'text'}>
                        {SECTION_LABELS[section]}
                      </ThemedText>
                      {isCurrent ? (
                        <ThemedText type="small" themeColor="textSecondary">
                          Current
                        </ThemedText>
                      ) : null}
                    </ThemedView>
                  </Pressable>
                );
              })}
              <Pressable onPress={onRequestClose} style={({ pressed }) => pressed && styles.pressed}>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
