// The first Stack in the repo. Native tabs have no mock stack header and cannot
// push on their own, so per Expo's native-tabs guidance a Stack is nested inside
// the tab — that is what makes `/review` pushable over Today.
import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function TodayLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      {/* Today owns its own layout down to the safe area, so no header here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
