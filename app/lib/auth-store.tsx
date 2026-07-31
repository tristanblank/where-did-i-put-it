import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { Alert } from 'react-native';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type AuthStore = {
  session: Session | null;
  householdId: string | null;
  // True until the first session-restore attempt resolves, so the root
  // layout doesn't flash the sign-in screen before we know if there's
  // already a persisted session.
  initializing: boolean;
  // False from the moment a *new* user signs in until their household has
  // actually been looked up. Without it the root layout sees a session
  // with a still-null householdId and briefly routes to household setup —
  // so signing in flashes "Create a household" at someone who already has
  // one, which reads like their data is gone.
  householdResolved: boolean;
  signInWithApple: () => Promise<void>;
  signInWithEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshHouseholdId: () => Promise<void>;
};

const AuthContext = createContext<AuthStore | null>(null);

function extractCode(url: string): string | null {
  try {
    return new URL(url).searchParams.get('code');
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [householdResolved, setHouseholdResolved] = useState(false);
  // Which user the current householdId belongs to. onAuthStateChange also
  // fires on every token refresh, and re-fetching (or worse, blanking the
  // routing state) on those would put a flash back in for no reason —
  // nothing about the household changed.
  const lastUserIdRef = useRef<string | null>(null);

  const fetchHouseholdId = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('household_id').eq('id', userId).maybeSingle();
    if (error) {
      // Still mark it resolved: routing has to proceed on *something*, and
      // leaving it false strands the user on a screen with no way out.
      console.error('Failed to fetch household id', error);
      setHouseholdResolved(true);
      return;
    }
    setHouseholdId(data?.household_id ?? null);
    setHouseholdResolved(true);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      lastUserIdRef.current = data.session?.user.id ?? null;
      if (data.session) await fetchHouseholdId(data.session.user.id);
      else setHouseholdResolved(true);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const nextUserId = next?.user.id ?? null;
      const changed = nextUserId !== lastUserIdRef.current;
      lastUserIdRef.current = nextUserId;

      // Only a genuine change of user needs a lookup. Token refreshes fire
      // here too with the same user, and reacting to those would blank the
      // routing state mid-session.
      if (!changed) return;

      if (nextUserId) {
        setHouseholdResolved(false);
        fetchHouseholdId(nextUserId);
      } else {
        setHouseholdId(null);
        setHouseholdResolved(true);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Magic-link callback handling. The client is explicitly configured for
  // PKCE (see supabase.ts), so the link carries `?code=...` rather than a
  // `#access_token=` fragment — handled here, not as a dedicated route,
  // since there's nothing to render.
  //
  // A failure here used to be console-only, which made it invisible: the
  // link would consume its one-time token server-side, the exchange would
  // fail, and the user would be dropped back on the sign-in screen to
  // find the 6-digit code from the same email now rejected too. If the
  // exchange fails there is no recovering that token, so say so and tell
  // them what actually works.
  useEffect(() => {
    const handleUrl = (url: string) => {
      const code = extractCode(url);
      if (code) {
        supabase.auth.exchangeCodeForSession(code).catch((e) => {
          console.error('Magic link exchange failed', e);
          Alert.alert(
            "That link didn't work",
            'Request a new sign-in email and enter the code from it instead.'
          );
        });
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  const signInWithApple = async () => {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!credential.identityToken) {
      throw new Error("Apple didn't return an identity token");
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;
  };

  const signInWithEmailOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: Linking.createURL('') },
    });
    if (error) throw error;
  };

  // Fallback for the magic-link tap: it needs the phone to reach the dev
  // server's own LAN address for the final redirect, which flaky Wi-Fi
  // routing can break. The same email also carries a numeric token that
  // verifies directly against Supabase, no redirect involved.
  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // The client only ever holds the anon key, which can't delete an
  // auth.users row directly -- delete_own_account() is a security-definer
  // RPC that runs with the elevated privileges that requires. Explicit
  // signOut afterward clears the now-dangling local session immediately,
  // rather than waiting on it to fail naturally on its next use.
  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  };

  const refreshHouseholdId = async () => {
    if (session) await fetchHouseholdId(session.user.id);
  };

  const value: AuthStore = {
    session,
    householdId,
    initializing,
    householdResolved,
    signInWithApple,
    signInWithEmailOtp,
    verifyEmailOtp,
    signOut,
    deleteAccount,
    refreshHouseholdId,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
