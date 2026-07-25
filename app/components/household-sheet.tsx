import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';
import { supabase } from '@/lib/supabase';

type HouseholdSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function HouseholdSheet({ visible, onClose }: HouseholdSheetProps) {
  const t = useTheme();
  const { householdId, deleteAccount } = useAuth();
  const { clearLocalData } = useItemsStore();
  const [name, setName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  if (!visible) return null;

  const handleShare = () => {
    if (!inviteCode) return;
    Share.share({
      message: `Join our household on Stasher — enter this invite code: ${inviteCode}`,
    });
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
      <View style={[styles.sheet, { backgroundColor: t.tile, borderColor: t.border }]}>
        <Text style={[styles.headerTitle, { color: t.ink }]}>{name ?? 'Household'}</Text>
        <Text style={[styles.subtitle, { color: t.sub }]}>
          Share this code so someone else can join and see the same data.
        </Text>

        <View style={[styles.codeTile, { backgroundColor: t.tileAlt, borderColor: t.border }]}>
          <Text style={[styles.codeText, { color: t.ink }]}>{inviteCode ?? '········'}</Text>
        </View>

        <Pressable
          onPress={handleShare}
          disabled={!inviteCode}
          style={[styles.shareButton, { backgroundColor: t.accent }, !inviteCode && styles.disabled]}>
          <Text style={[styles.shareButtonText, { color: t.accentInk }]}>Share invite code</Text>
        </Pressable>

        <Pressable style={[styles.cancelRow, { borderColor: t.border }]} onPress={onClose}>
          <Text style={[styles.cancelText, { color: t.sub }]}>Close</Text>
        </Pressable>

        <Pressable style={styles.deleteRow} onPress={handleDeleteAccount} disabled={deleting}>
          <Text style={[styles.deleteText, { color: t.danger }, deleting && styles.disabled]}>
            {deleting ? 'Deleting account…' : 'Delete account'}
          </Text>
        </Pressable>
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
    lineHeight: 18,
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
