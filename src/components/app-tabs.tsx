// Native tab bar. Keep in sync with `app-tabs.web.tsx` — Metro picks one per
// platform, so a tab added here and not there breaks web silently (and vice versa).
//
// This stays a real platform tab bar. `NativeTabs` has no supported slot for a
// raised custom center tab, and replacing it with a hand-drawn bar to get one
// would cost the native blur, the safe-area handling and the platform's own
// press behavior. Capture instead floats above it on Today (`capture-fab.tsx`);
// web, whose bar we draw ourselves, gets the raised button inline.
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  const theme = useTheme();

  return (
    <NativeTabs
      backgroundColor={theme.surface}
      // Android's selection pill. iOS ignores it.
      indicatorColor={theme.accentSoft}
      iconColor={{ default: theme.textMuted, selected: theme.accent }}
      labelStyle={{
        default: { color: theme.textMuted },
        selected: { color: theme.accentText },
      }}>
      {/* The group segment is the route name: `src/app/(today)/`. */}
      <NativeTabs.Trigger name="(today)">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      {/* The group segment is the route name: `src/app/saved/`. Same
          no-PNG-asset situation as Training below. */}
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
        {Platform.OS === 'ios' ? <NativeTabs.Trigger.Icon sf="bookmark.fill" /> : null}
      </NativeTabs.Trigger>
      {/* The group segment is the route name: `src/app/training/`.
          No PNG icon exists for this tab yet (the other three use dedicated
          assets) — iOS gets a built-in SF Symbol in the meantime; Android has
          no equivalent system and renders label-only until a `src` image is
          supplied. */}
      <NativeTabs.Trigger name="training">
        <NativeTabs.Trigger.Label>Training</NativeTabs.Trigger.Label>
        {Platform.OS === 'ios' ? <NativeTabs.Trigger.Icon sf="flame.fill" /> : null}
      </NativeTabs.Trigger>
      {/* The group segment is the route name: `src/app/analytics/`. */}
      <NativeTabs.Trigger name="analytics">
        <NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
      {/* The group segment is the route name: `src/app/(profile)/`. */}
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/profile.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
