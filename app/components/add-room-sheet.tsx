import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

type AddRoomSheetProps = {
  visible: boolean;
  onClose: () => void;
};

// Rooms could only be created from the Add Item screen, which meant making
// one required starting to stash something and then abandoning it. The
// room did survive that, but nothing said so — and rooms are the app's
// top-level idea, so creating one belongs on the home screen next to them.
export function AddRoomSheet({ visible, onClose }: AddRoomSheetProps) {
  const t = useTheme();
  const { allRooms, addRoom } = useItemsStore();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const close = () => {
    setName('');
    setError(null);
    onClose();
  };

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the room a name');
      return;
    }
    // addRoom silently no-ops on a duplicate, which from the user's side
    // is indistinguishable from the button not working. Check first so
    // there's something to say.
    if (allRooms.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      setError(`You already have a room called ${trimmed}`);
      return;
    }
    addRoom(trimmed);
    close();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { backgroundColor: t.tile, borderColor: t.border }]}>
          <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
          <Text style={[styles.headerTitle, { color: t.ink }]}>Add a room</Text>
          <Text style={[styles.subtitle, { color: t.sub }]}>
            A garage, a shed, a storage unit — anywhere you put things.
          </Text>

          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            onSubmitEditing={handleAdd}
            placeholder="e.g. Garage"
            placeholderTextColor={t.sub}
            autoFocus
            maxLength={100}
            returnKeyType="done"
            style={[styles.input, { borderColor: t.border, color: t.ink, backgroundColor: t.tileAlt }]}
          />
          {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}

          <Pressable onPress={handleAdd} style={[styles.primaryButton, { backgroundColor: t.accent }]}>
            <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>Add room</Text>
          </Pressable>

          <Pressable style={[styles.cancelRow, { borderColor: t.border }]} onPress={close}>
            <Text style={[styles.cancelText, { color: t.sub }]}>Cancel</Text>
          </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
  },
  error: {
    marginTop: 8,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
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
});
