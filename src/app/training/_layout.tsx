// The Training tab's Stack, mirroring (today)/_layout.tsx and
// profile/_layout.tsx. Nothing pushes over the history list any more —
// logging and editing a session are both popups now
// (`training-session-sheet.tsx`) — but the Stack stays: native tabs can't push
// on their own, so this is what any future detail route would need, and it
// keeps the four tabs structurally identical.
import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function TrainingLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      {/* Training owns its own layout down to the safe area, so no header here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
