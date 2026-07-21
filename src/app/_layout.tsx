import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import OwnerSignIn from '@/components/owner-sign-in';
import { useOwnerSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // Gate the app on an authenticated owner session. While the persisted session
  // resolves, render only the splash; then show the one-time sign-in or the app.
  const { session, loading } = useOwnerSession();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {!loading && (session ? <AppTabs /> : <OwnerSignIn />)}
    </ThemeProvider>
  );
}
