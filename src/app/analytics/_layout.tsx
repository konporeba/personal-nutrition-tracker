// The Analytics tab's Stack, mirroring profile/_layout.tsx. Native tabs
// can't push on their own, so a Stack nested in the tab is what makes the
// past-day route (Phase 6) pushable over the Analytics dashboard.
import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function AnalyticsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      {/* Analytics owns its own layout down to the safe area, so no header here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
