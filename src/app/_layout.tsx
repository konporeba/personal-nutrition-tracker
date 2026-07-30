import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import OwnerSignIn from '@/components/owner-sign-in';
import PinGateScreen from '@/components/pin-gate-screen';
import { asyncStoragePersister, queryClient } from '@/data/query-client';
import { setupQueryRuntime } from '@/data/query-runtime';
import { PinGateProvider, usePinGate } from '@/lib/pin-gate';
import { useOwnerSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // Gate the app on an authenticated owner session. While the persisted session
  // resolves, render only the splash; then show the one-time sign-in or the app.
  const { session, loading } = useOwnerSession();

  // Native: refetch on app foreground. No-op on web (library default handles it).
  useEffect(() => setupQueryRuntime(), []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <PinGateProvider>
          <AnimatedSplashOverlay />
          {!loading && (session ? <PinGatedApp /> : <OwnerSignIn />)}
        </PinGateProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

// Gate daily use behind the device-local PIN (S-12) on top of the owner
// session above — same "wait for loading, then swap one component" idiom.
function PinGatedApp() {
  const { loading, unlocked } = usePinGate();
  if (loading) return null;
  return unlocked ? <AppTabs /> : <PinGateScreen />;
}
