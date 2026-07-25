import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { secureStorage } from '@/lib/secure-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set them in app/.env.local for local dev, and as EAS environment variables for builds.'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Keychain/Keystore, not AsyncStorage — the session's refresh token is
    // long-lived and mints access tokens indefinitely. See secure-storage.ts.
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// React Native apps don't get a browser tab-visibility signal, so Supabase's
// token auto-refresh needs to be driven off AppState explicitly — otherwise
// a session can go stale while the app sits backgrounded.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
