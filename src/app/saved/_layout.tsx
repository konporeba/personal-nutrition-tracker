// The Saved-meals tab's Stack, mirroring training/_layout.tsx. Nothing pushes
// over the library list — adding, editing and deleting a saved meal are all one
// popup (`saved-meal-sheet.tsx`) — but the Stack stays: native tabs can't push
// on their own, so this is what any future detail route would need, and it keeps
// the tabs structurally identical.
import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function SavedLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      {/* Saved owns its own layout down to the safe area, so no header here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
