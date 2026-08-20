import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// Both are public identifiers, not secrets — they ship inside the binary
// either way, and Google's security model doesn't depend on hiding them.
// They live in the environment only so an unconfigured checkout doesn't
// present a sign-in button that cannot work.
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// The sign-in screen hides the Google button when this is false. Deliberate:
// the alternative is a button that opens Google, succeeds, and then fails at
// the Supabase exchange — which looks like the account is broken rather than
// like the app was built without the credentials.
export const googleSignInConfigured = Boolean(googleIosClientId && googleWebClientId);

// configure() is synchronous and idempotent, so it belongs at module load
// rather than in a component body where it would re-run on every render.
if (googleSignInConfigured) {
  GoogleSignin.configure({
    iosClientId: googleIosClientId,
    // Not an oversight on an iOS-only app: Google mints the ID token against
    // the *web* client, and it is the audience Supabase checks the token
    // against. Without it the token comes back scoped to the iOS client and
    // Supabase rejects it.
    webClientId: googleWebClientId,
  });
}

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
  signInWithGoogle: () => Promise<void>;
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

  // Deep-link callback handling. Currently dormant by configuration:
  // both email templates send a code and no link, so nothing arrives here
  // in normal use. Kept because it's the difference between a link
  // working and a link silently eating its own one-time token — if a
  // template is ever changed back, or a future flow (password recovery,
  // email change) sends one, this is what makes it land.
  //
  // The client is explicitly configured for PKCE (see supabase.ts), so a
  // link carries `?code=...` rather than a `#access_token=` fragment.
  // Handled here rather than as a route, since there's nothing to render.
  //
  // A failure used to be console-only, which made it invisible: the link
  // consumed its token server-side, the exchange failed, and the user was
  // dropped back on the sign-in screen to find the code from that same
  // email now rejected too. The token is unrecoverable at that point, so
  // say so and point at what will actually work.
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

  // No nonce here, unlike the Apple flow above. Apple returns a token bound
  // to a nonce we generate; Google only puts a nonce claim in the token if
  // one was requested, and Supabase validates that claim only when present.
  // Passing one through this library's iOS path isn't supported, so the
  // token is validated by audience and signature alone — which is what
  // Supabase's own React Native example does.
  const signInWithGoogle = async () => {
    if (!googleSignInConfigured) {
      throw new Error(
        'Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and ' +
          'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — see backend/supabase/auth-config.md.'
      );
    }

    // Android-only check, and it throws on a device without Play Services
    // rather than returning false. Nothing to check on iOS.
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();

    const response = await GoogleSignin.signIn();

    // Cancelling returns a response with type 'cancelled' rather than
    // throwing, so this is the normal "user backed out" path, not a failure.
    if (!isSuccessResponse(response)) return;

    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error("Google didn't return an identity token");
    }

    // Every successful sign-in logs a GoTrue warning: the ID token carries
    // an `at_hash` claim with no access_token beside it, and access_token
    // "will be mandatory" in a future version. Sending it now means that
    // change lands as a no-op instead of breaking Google sign-in for
    // everyone at once. It also buys a real check rather than just silence
    // — given the value, GoTrue verifies the hash in the token against it.
    //
    // The fallback is deliberate: fetching this can fail on a bad network,
    // and today that must not turn a working sign-in into a failed one.
    // When access_token does become mandatory, this path stops working on
    // its own, loudly, at Supabase — which is the right place for it.
    let accessToken: string | undefined;
    try {
      accessToken = (await GoogleSignin.getTokens()).accessToken;
    } catch (e) {
      console.error('Google getTokens failed; signing in without access_token', e);
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      access_token: accessToken,
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

  // The primary email path, not a fallback — both email templates are
  // configured to send only an 8-digit code, no link. Magic links on
  // mobile are structurally fragile: the mail client may open its own
  // browser, the deep link may not fire, and under PKCE a link opened on
  // a different device than requested it cannot work at all, because the
  // verifier is local to the requesting device. A typed code has none of
  // those failure modes and works cross-device.
  //
  // `type: 'email'` covers both templates — verified against a signup
  // confirmation token, not just a returning-user one.
  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  };

  // The Google SDK holds a cached account of its own, separate from the
  // Supabase session and untouched by signing out of Supabase. Left in
  // place, the next tap of "Sign in with Google" can reuse it without ever
  // showing the chooser — so a second person on the same phone can't sign
  // in, and nobody can switch Google accounts. Best-effort: a failure here
  // must not block the sign-out that actually matters, and there's nothing
  // the user could do about it.
  const signOutOfGoogleSdk = async () => {
    if (!googleSignInConfigured) return;
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.error('Google SDK sign-out failed', e);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await signOutOfGoogleSdk();
  };

  // The client only ever holds the anon key, which can't delete an
  // auth.users row directly -- delete_own_account() is a security-definer
  // RPC that runs with the elevated privileges that requires. Explicit
  // signOut afterward clears the now-dangling local session immediately,
  // rather than waiting on it to fail naturally on its next use.
  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;

    // Revoke rather than just sign out: the account that grant belonged to
    // no longer exists, so leaving Stasher listed under the user's Google
    // account permissions is a leftover of something they asked to be
    // destroyed. Harmless no-op for anyone who signed in another way.
    if (googleSignInConfigured) {
      try {
        await GoogleSignin.revokeAccess();
      } catch (e) {
        console.error('Google access revocation failed', e);
      }
    }

    // The user row is already gone, so /logout answers 403 user_not_found —
    // seen in auth_logs on the first real deletion. auth-js swallows
    // 401/403/404 there and clears the local session anyway, so this
    // resolves cleanly today. Throwing on it would mean a change to that
    // behaviour reports failure for a deletion that already succeeded and
    // cannot be retried. Log it and let the caller finish.
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) console.error('Sign-out after account deletion failed', signOutError);
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
    signInWithGoogle,
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
