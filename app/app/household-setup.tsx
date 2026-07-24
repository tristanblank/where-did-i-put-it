import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useAuth } from '@/lib/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';
import { migrateLegacyLocalData } from '@/lib/migrate-legacy-data';
import { supabase } from '@/lib/supabase';

type Mode = 'choice' | 'create' | 'join' | 'created';

export default function HouseholdSetupScreen() {
  const t = useTheme();
  const { theme, applyMigration } = useItemsStore();
  const { session, refreshHouseholdId, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('choice');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputStyle = [styles.input, { borderColor: t.border, backgroundColor: t.tile, color: t.ink }];

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your household a name');
      return;
    }
    if (!session) return;
    setError(null);
    setBusy(true);

    let householdId: string;
    try {
      const { data, error: rpcError } = await supabase.rpc('create_household', { p_name: trimmed });
      if (rpcError) throw rpcError;
      householdId = data;
    } catch {
      setError("Couldn't create the household. Please try again.");
      setBusy(false);
      return;
    }

    // create_household isn't idempotent and this profile is now linked to
    // householdId — retrying it from here would create a second, orphaned
    // household rather than resuming this one. So any failure past this
    // point is surfaced without offering a "try again" that re-runs
    // create_household; the user just proceeds to home instead.
    try {
      // One-time push of any pre-Phase-4 local data into the household
      // that was just created — never run on join, since a joining spouse
      // should see the household's existing data, not overwrite it with
      // her own empty local state.
      const migrated = await migrateLegacyLocalData(householdId, session.user.id);
      if (migrated) applyMigration(migrated);

      // Hold off on refreshHouseholdId() here — it flips the root layout's
      // guard straight to the home screen, which would skip past ever
      // showing the invite code. Shown first, then handleContinue below
      // does the actual navigation.
      const { data: household, error: fetchError } = await supabase
        .from('households')
        .select('invite_code')
        .eq('id', householdId)
        .single();
      if (fetchError) throw fetchError;

      setInviteCode(household.invite_code);
      setMode('created');
    } catch (e) {
      console.error('Post-creation step failed', e);
      Alert.alert(
        'Household created',
        "Your household was created, but something didn't finish (like moving over your old items). You can keep going — check your items once you're in, and grab your invite code later from the 👥 button on the home screen."
      );
      await refreshHouseholdId();
    } finally {
      setBusy(false);
    }
  };

  const handleShareCode = () => {
    if (!inviteCode) return;
    Share.share({
      message: `Join our household on Stasher — enter this invite code: ${inviteCode}`,
    });
  };

  const handleContinue = () => {
    refreshHouseholdId();
  };

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the invite code');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('join_household', { code: trimmed });
      if (rpcError) throw rpcError;
      await refreshHouseholdId();
    } catch {
      setError("That code didn't work — double-check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          {mode === 'choice' && (
            <>
              <Text style={[styles.eyebrow, { color: t.accent }]}>One more thing</Text>
              <Text style={[styles.title, { color: t.ink }]}>Set up your household</Text>
              <Text style={[styles.subtitle, { color: t.sub }]}>
                Create a new household, or join one your partner already started.
              </Text>

              <Pressable
                onPress={() => setMode('create')}
                style={[baseTileStyle(t, theme), styles.choiceTile]}>
                <Text style={[styles.choiceTitle, { color: t.ink }]}>Create a household</Text>
                <Text style={[styles.choiceBody, { color: t.sub }]}>
                  You&rsquo;ll get an invite code to share.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setMode('join')}
                style={[baseTileStyle(t, theme), styles.choiceTile]}>
                <Text style={[styles.choiceTitle, { color: t.ink }]}>Join with a code</Text>
                <Text style={[styles.choiceBody, { color: t.sub }]}>
                  Someone already created your household.
                </Text>
              </Pressable>

              <Pressable onPress={() => signOut()} style={styles.signOutRow}>
                <Text style={[styles.signOutText, { color: t.sub }]}>Sign out</Text>
              </Pressable>
            </>
          )}

          {mode === 'create' && (
            <>
              <Pressable onPress={() => setMode('choice')}>
                <Text style={[styles.back, { color: t.sub }]}>{'← Back'}</Text>
              </Pressable>
              <Text style={[styles.title, { color: t.ink, marginTop: 12 }]}>Name your household</Text>
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setError(null);
                }}
                placeholder="e.g. The Blanks"
                placeholderTextColor={t.sub}
                autoFocus
                maxLength={200}
                style={inputStyle}
              />
              {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
              <Pressable
                onPress={handleCreate}
                disabled={busy}
                style={[styles.primaryButton, { backgroundColor: t.accent }, busy && styles.disabled]}>
                <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>Create household</Text>
              </Pressable>
            </>
          )}

          {mode === 'join' && (
            <>
              <Pressable onPress={() => setMode('choice')}>
                <Text style={[styles.back, { color: t.sub }]}>{'← Back'}</Text>
              </Pressable>
              <Text style={[styles.title, { color: t.ink, marginTop: 12 }]}>Enter your invite code</Text>
              <TextInput
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setError(null);
                }}
                placeholder="e.g. 4f8a1c2e"
                placeholderTextColor={t.sub}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                style={inputStyle}
              />
              {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}
              <Pressable
                onPress={handleJoin}
                disabled={busy}
                style={[styles.primaryButton, { backgroundColor: t.accent }, busy && styles.disabled]}>
                <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>Join household</Text>
              </Pressable>
            </>
          )}

          {mode === 'created' && inviteCode && (
            <>
              <Text style={[styles.eyebrow, { color: t.accent }]}>Household created</Text>
              <Text style={[styles.title, { color: t.ink }]}>Share your invite code</Text>
              <Text style={[styles.subtitle, { color: t.sub }]}>
                Your partner enters this on their phone to join and see the same data.
              </Text>

              <View style={[baseTileStyle(t, theme), styles.codeTile]}>
                <Text style={[styles.codeText, { color: t.ink }]}>{inviteCode}</Text>
              </View>

              <Pressable
                onPress={handleShareCode}
                style={[styles.primaryButton, { backgroundColor: t.accent }]}>
                <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>Share invite code</Text>
              </Pressable>

              <Pressable onPress={handleContinue} style={styles.signOutRow}>
                <Text style={[styles.signOutText, { color: t.sub }]}>Continue to Stasher</Text>
              </Pressable>
            </>
          )}
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
    marginBottom: 24,
  },
  choiceTile: {
    padding: 18,
    marginBottom: 12,
  },
  choiceTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
    marginBottom: 4,
  },
  choiceBody: {
    fontSize: 13,
  },
  codeTile: {
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeText: {
    fontFamily: Fonts.bold,
    fontSize: 32,
    letterSpacing: 4,
  },
  signOutRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  signOutText: {
    fontSize: 13,
    fontFamily: Fonts.regular,
  },
  back: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    marginBottom: 8,
  },
  error: {
    marginBottom: 12,
    fontSize: 13,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
});
