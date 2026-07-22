import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useAuth } from '@/lib/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

export default function SignInScreen() {
  const t = useTheme();
  const { theme } = useItemsStore();
  const { signInWithApple, signInWithEmailOtp } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleApple = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithApple();
    } catch (e) {
      // A cancelled system dialog isn't an error worth surfacing.
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') {
        console.error('Apple sign-in error', JSON.stringify(e), e);
        setError('Sign in with Apple failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEmailLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailOtp(trimmed);
      setSent(true);
    } catch {
      setError("Couldn't send the link. Check the address and try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    { borderColor: t.border, backgroundColor: t.tile, color: t.ink },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={[styles.eyebrow, { color: t.accent }]}>Stasher</Text>
          <Text style={[styles.title, { color: t.ink }]}>Sign in to your household</Text>
          <Text style={[styles.subtitle, { color: t.sub }]}>
            So what you stash shows up on both phones, not just this one.
          </Text>

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                theme === 'light'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleApple}
            />
          )}

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
            <Text style={[styles.dividerText, { color: t.sub }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
          </View>

          {sent ? (
            <View style={[baseTileStyle(t, theme), styles.sentTile]}>
              <Text style={[styles.sentTitle, { color: t.ink }]}>Check your email</Text>
              <Text style={[styles.sentBody, { color: t.sub }]}>
                Tap the link we sent to {email.trim()} to finish signing in.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={t.sub}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={inputStyle}
              />
              <Pressable
                onPress={handleEmailLink}
                disabled={busy}
                style={[styles.emailButton, { backgroundColor: t.accent }, busy && styles.disabled]}>
                <Text style={[styles.emailButtonText, { color: t.accentInk }]}>Email me a sign-in link</Text>
              </Pressable>
            </>
          )}

          {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 24,
  },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 26,
    lineHeight: 30,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 28,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    marginBottom: 12,
  },
  emailButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  emailButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  sentTile: {
    padding: 20,
  },
  sentTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    marginBottom: 6,
  },
  sentBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    marginTop: 16,
    fontSize: 13,
    textAlign: 'center',
  },
});
