// Native (iOS/Android) Supabase client. Metro resolves this file everywhere
// except web, where `supabase.web.ts` is used instead. Always import as
// `@/lib/supabase` — never reach for the platform file directly.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist the owner session to AsyncStorage so a one-time sign-in survives
    // app restarts (see src/lib/session.ts). The anon key is public by design;
    // privacy is enforced by RLS, not by hiding this value.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Drive token auto-refresh off app foreground/background. Supabase only refreshes
// while the app is active; toggling here avoids wasted refreshes in the background.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
