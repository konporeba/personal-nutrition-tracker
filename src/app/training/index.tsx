// Training — the full cross-day session history (moved off Today's dashboard
// into its own tab, so logging and reviewing training no longer competes with
// the meal log for space). Log a session, browse every session ever logged,
// tap one to edit or delete it.
//
// Both of those actions open `TrainingSessionSheet` rather than pushing a
// route. They used to be full screens (`session-composer` / `session-detail`,
// both deleted), which meant a stack header slid over the tab to show four
// fields — the same complaint the Today rail's past-day route earned, and the
// same fix.
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrainingSessionRow } from '@/components/training-session-row';
import { TrainingSessionSheet } from '@/components/training-session-sheet';
import { AppButton } from '@/components/ui/app-button';
import { Screen, useScreenContentInsets } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import type { TrainingSession } from '@/data/types';
import { useAllTrainingSessions } from '@/data/use-training-sessions';
import { useLayout } from '@/hooks/use-layout';

export default function TrainingScreen() {
  const { isWide } = useLayout();
  const insets = useScreenContentInsets();
  const { data, isPending, isError } = useAllTrainingSessions();
  const sessions = data ?? [];

  // One sheet for both jobs: `editing` null with the sheet open means "log a
  // new session", a session means "edit that one".
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingSession | null>(null);

  function open(session: TrainingSession | null) {
    setEditing(session);
    setSheetOpen(true);
  }

  return (
    <Screen>
      <FlatList
        data={sessions}
        keyExtractor={(session) => session.id}
        renderItem={({ item }) => (
          <TrainingSessionRow
            session={item}
            date={new Date(item.logged_at)}
            onPress={() => open(item)}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          // Same shape as Today's header — title and count on the left, the
          // primary action on the right — and the identical button, down to
          // the icon and the bold label.
          <ThemedView
            type="transparent"
            style={[styles.head, isWide ? styles.headWide : styles.headColumn]}>
            <ThemedView type="transparent" style={styles.headText}>
              <ThemedText type={isWide ? 'title' : 'subtitle'}>Training</ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                {sessions.length} logged
              </ThemedText>
            </ThemedView>
            <AppButton
              label="Log training"
              icon="☑️"
              size="small"
              variant="soft"
              strong
              onPress={() => open(null)}
            />
          </ThemedView>
        }
        ListEmptyComponent={
          isPending ? (
            <ActivityIndicator style={styles.empty} />
          ) : (
            <ThemedText themeColor="textMuted" style={styles.empty}>
              {isError
                ? "Couldn't load your training history."
                : 'Nothing logged yet — a session adds its burn to that day’s budget.'}
            </ThemedText>
          )
        }
        contentContainerStyle={{
          paddingHorizontal: insets.paddingHorizontal,
          paddingTop: insets.paddingTop,
          paddingBottom: insets.paddingBottom,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Remounted per session: the sheet seeds its fields from `session` in
          `useState` initializers, which only run on mount — the same reason
          `AddMealSheet` is keyed on its section. */}
      <TrainingSessionSheet
        key={editing?.id ?? 'new'}
        visible={sheetOpen}
        session={editing}
        onRequestClose={() => setSheetOpen(false)}
      />
    </Screen>
  );
}

function Separator() {
  return <ThemedView type="transparent" style={styles.separator} />;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  headColumn: {
    // The column shape (phone, mobile web) reserves nothing above the content
    // — its tab bar is at the bottom — so the title would otherwise start hard
    // against the safe area. The same `three` Today, Analytics and Profile put
    // above their own headers, so every tab starts on the same line.
    paddingTop: Spacing.three,
  },
  headWide: {
    // The dashboard's own frame already pads the top (`useScreenContentInsets`).
    paddingTop: 0,
  },
  headText: {
    gap: Spacing.half,
    flexShrink: 1,
  },
  separator: {
    height: Spacing.two,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
});
