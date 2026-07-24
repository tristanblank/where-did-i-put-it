import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type AuthStore = {
  session: Session | null;
  householdId: string | null;
  // True until the first session-restore attempt resolves, so the root
  // layout doesn't flash the sign-in screen before we know if there's
  // already a persisted session.
  initializing: boolean;
  signInWithApple: () => Promise<void>;
  signInWithEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
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

  const fetchHouseholdId = async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('household_id').eq('id', userId).maybeSingle();
    if (error) {
      console.error('Failed to fetch household id', error);
      return;
    }
    setHouseholdId(data?.household_id ?? null);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await fetchHouseholdId(data.session.user.id);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) {
        fetchHouseholdId(next.user.id);
      } else {
        setHouseholdId(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Magic-link callback handling. supabase-js defaults to the PKCE flow, so
  // the link carries `?code=...` rather than a `#access_token=` fragment —
  // handled here, not as a dedicated route, since there's nothing to render.
  useEffect(() => {
    const handleUrl = (url: string) => {
      const code = extractCode(url);
      if (code) {
        supabase.auth.exchangeCodeForSession(code).catch((e) => console.error('Magic link exchange failed', e));
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

  const refreshHouseholdId = async () => {
    if (session) await fetchHouseholdId(session.user.id);
  };

  const value: AuthStore = {
    session,
    householdId,
    initializing,
    signInWithApple,
    signInWithEmailOtp,
    verifyEmailOtp,
    signOut,
    refreshHouseholdId,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
