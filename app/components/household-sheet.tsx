import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-store';
import { useHouseholdMembers } from '@/hooks/use-household-members';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';
import { supabase } from '@/lib/supabase';

type HouseholdSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function HouseholdSheet({ visible, onClose }: HouseholdSheetProps) {
  const t = useTheme();
  const { householdId, deleteAccount, signOut, session, refreshHouseholdId } = useAuth();
  const { clearLocalData } = useItemsStore();
  const { members, refresh: refreshMembers } = useHouseholdMembers();
  const [name, setName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible || !householdId) return;
    supabase
      .from('households')
      .select('name, invite_code')
      .eq('id', householdId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to fetch household info', error);
          return;
        }
        setName(data.name);
        setInviteCode(data.invite_code);
      });
  }, [visible, householdId]);

  // Seed the input from whatever's already stored, each time the sheet
  // opens — not on every members change, or a save would fight the text
  // the user is still typing.
  useEffect(() => {
    if (!visible) return;
    const mine = members.find((m) => m.id === session?.user.id);
    setDisplayName(mine?.displayName ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, session?.user.id]);

  if (!visible) return null;

  // display_name is the one profiles column the client can write — the
  // column-level grant deliberately excludes household_id, so this can't
  // be repurposed into a household switch.
  const handleSaveName = async () => {
    if (!session) return;
    const trimmed = displayName.trim();
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmed || null })
        .eq('id', session.user.id);
      if (error) throw error;
      await refreshMembers();
    } catch (e) {
      console.error('Failed to save display name', e);
      Alert.alert('Something went wrong', "Couldn't save your name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  // Leaving does not delete anything. If you're the last member out, the
  // household is stamped abandoned_at and left fully intact — the free
  // plan has no backups and no PITR, so a destructive version of this
  // would be unrecoverable by anyone. The invite code keeps working,
  // which makes rejoining the undo.
  const handleLeave = () => {
    const isLastMember = members.length <= 1;
    Alert.alert(
      'Leave this household?',
      isLastMember
        ? "You're the only one here, so nothing will be able to see these items once you go. Nothing is deleted — keep your invite code and you can rejoin with it to get everything back."
        : "You'll stop seeing this household's items on this phone. The others stay in, and you can rejoin later with the invite code.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              const { error } = await supabase.rpc('leave_household');
              if (error) throw error;
              // Drop this device's cached copy before the household guard
              // flips, or the setup screen's legacy migration would find
              // the old household's items sitting in AsyncStorage and
              // push them into whatever gets created or joined next.
              await clearLocalData();
              await refreshHouseholdId();
            } catch (e) {
              console.error('Failed to leave household', e);
              Alert.alert('Something went wrong', "Couldn't leave the household. Please try again.");
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  const handleShare = () => {
    if (!inviteCode) return;
    Share.share({
      message: `Join our household on Stasher — enter this invite code: ${inviteCode}`,
    });
  };

  // An invite code is valid forever once it exists, and it travels — it
  // gets texted, screenshotted, read aloud. Rotating is the only way to
  // take one back. rotate_invite_code() returns the new code, so there's
  // no follow-up read to get it on screen.
  //
  // Worth being precise in the confirmation about what rotation does and
  // doesn't do: it invalidates the code, not anyone's membership. Someone
  // who already joined stays joined — rotating is not how you remove a
  // person, and a user who assumed otherwise would be badly surprised.
  const handleRotate = () => {
    Alert.alert(
      'Generate a new code?',
      "The current code stops working right away. Anyone already in the household stays in — but if you've shared the old code with someone who hasn't joined yet, you'll need to send them the new one.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate new code',
          style: 'destructive',
          onPress: async () => {
            setRotating(true);
            try {
              const { data, error } = await supabase.rpc('rotate_invite_code');
              if (error) throw error;
              setInviteCode(data);
            } catch (e) {
              console.error('Invite code rotation failed', e);
              Alert.alert('Something went wrong', "Couldn't generate a new code. Please try again.");
            } finally {
              setRotating(false);
            }
          },
        },
      ]
    );
  };

  // Until this existed, the only way out of a signed-in household was
  // "Delete account" — the setup screen's sign-out is unreachable once
  // householdId is set, since the root layout guards that route on it
  // being null. Signing out leaves household membership intact; signing
  // back in lands straight back on the same data.
  const handleSignOut = () => {
    Alert.alert('Sign out?', "Your household and everything in it stays put. You'll need to sign in again to see it.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: async () => {
          try {
            await signOut();
          } catch (e) {
            console.error('Sign out failed', e);
            Alert.alert('Something went wrong', "Couldn't sign you out. Please try again.");
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      "This can't be undone. You'll be signed out immediately and your account permanently deleted. If anyone else is still in this household, their data stays untouched — if you're the only one, the household and everything in it goes too.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              await clearLocalData();
            } catch (e) {
              console.error('Account deletion failed', e);
              Alert.alert('Something went wrong', "Couldn't delete your account. Please try again.");
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/* Capped and scrollable. The sheet is anchored to the bottom, so
          content taller than the screen grows upward and disappears off
          the top — at large text sizes that swallowed the household name
          and everything below the fold. */}
      <View style={[styles.sheet, { backgroundColor: t.tile, borderColor: t.border }]}>
        <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
        <Text style={[styles.headerTitle, { color: t.ink }]}>{name ?? 'Household'}</Text>
        <Text style={[styles.subtitle, { color: t.sub }]}>
          Share this code so someone else can join and see the same data.
        </Text>

        <View style={[styles.codeTile, { backgroundColor: t.tileAlt, borderColor: t.border }]}>
          {/* Never wraps. An 8-character code broken across two lines is
              misread and mistyped — this is the one string in the app
              where shrinking beats reflowing. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.codeText, { color: t.ink, opacity: rotating ? 0.4 : 1 }]}>
            {inviteCode ?? '········'}
          </Text>
        </View>

        <Pressable
          onPress={handleShare}
          disabled={!inviteCode || rotating}
          style={[styles.shareButton, { backgroundColor: t.accent }, (!inviteCode || rotating) && styles.disabled]}>
          <Text style={[styles.shareButtonText, { color: t.accentInk }]}>Share invite code</Text>
        </Pressable>

        <Pressable onPress={handleRotate} disabled={!inviteCode || rotating} style={styles.rotateRow}>
          <Text style={[styles.rotateText, { color: t.sub }, (!inviteCode || rotating) && styles.disabled]}>
            {rotating ? 'Generating…' : 'Generate a new code'}
          </Text>
        </Pressable>

        <View style={[styles.section, { borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.sub }]}>YOUR NAME</Text>
          <View style={styles.nameRow}>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              onBlur={handleSaveName}
              onSubmitEditing={handleSaveName}
              placeholder="Add a name or nickname"
              placeholderTextColor={t.sub}
              maxLength={200}
              returnKeyType="done"
              style={[styles.nameInput, { borderColor: t.border, backgroundColor: t.tileAlt, color: t.ink }]}
            />
            {savingName ? <Text style={[styles.savingText, { color: t.sub }]}>Saving…</Text> : null}
          </View>
          <Text style={[styles.sectionHint, { color: t.sub }]}>
            This is what the rest of your household sees next to items you add.
          </Text>
        </View>

        {members.length > 1 ? (
          <View style={[styles.section, { borderColor: t.border }]}>
            <Text style={[styles.sectionLabel, { color: t.sub }]}>
              {members.length} PEOPLE IN THIS HOUSEHOLD
            </Text>
            {members.map((m) => (
              <Text key={m.id} style={[styles.memberRow, { color: t.ink }]}>
                {m.displayName?.trim() || 'Unnamed member'}
                {m.id === session?.user.id ? ' (you)' : ''}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable style={[styles.cancelRow, { borderColor: t.border }]} onPress={onClose}>
          <Text style={[styles.cancelText, { color: t.sub }]}>Close</Text>
        </Pressable>

        <Pressable style={styles.signOutRow} onPress={handleSignOut} disabled={deleting}>
          <Text style={[styles.signOutText, { color: t.sub }, deleting && styles.disabled]}>Sign out</Text>
        </Pressable>

        <Pressable style={styles.signOutRow} onPress={handleLeave} disabled={deleting || leaving}>
          <Text style={[styles.signOutText, { color: t.sub }, (deleting || leaving) && styles.disabled]}>
            {leaving ? 'Leaving…' : 'Leave household'}
          </Text>
        </Pressable>

        <Pressable style={styles.deleteRow} onPress={handleDeleteAccount} disabled={deleting}>
          <Text style={[styles.deleteText, { color: t.danger }, deleting && styles.disabled]}>
            {deleting ? 'Deleting account…' : 'Delete account'}
          </Text>
        </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // This sheet has grown a lot — name field, member list, five actions.
    // Bottom-anchored, so without a cap it grows off the top of the
    // screen and takes the household name with it.
    maxHeight: '88%',
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 36,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  codeTile: {
    marginTop: 20,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  codeText: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    letterSpacing: 4,
  },
  shareButton: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  shareButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  rotateRow: {
    marginTop: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  rotateText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
  section: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  sectionLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  sectionHint: {
    marginTop: 8,
    fontSize: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: Fonts.regular,
  },
  savingText: {
    fontSize: 12,
  },
  memberRow: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    paddingVertical: 4,
  },
  cancelRow: {
    marginTop: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  signOutRow: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  deleteRow: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: {
    fontFamily: Fonts.regular,
    fontSize: 13,
  },
});
