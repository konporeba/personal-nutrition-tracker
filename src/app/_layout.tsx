import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import OwnerSignIn from '@/components/owner-sign-in';
import { asyncStoragePersister, queryClient } from '@/data/query-client';
import { setupQueryRuntime } from '@/data/query-runtime';
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
        <AnimatedSplashOverlay />
        {!loading && (session ? <AppTabs /> : <OwnerSignIn />)}
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
