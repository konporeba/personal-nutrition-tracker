// The Profile tab's Stack, mirroring (today)/_layout.tsx. Native tabs can't push
// on their own, so a Stack nested in the tab is what makes `/weight` pushable
// over the profile form.
import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function ProfileLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      {/* Profile owns its own layout down to the safe area, so no header here. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
