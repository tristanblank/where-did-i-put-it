import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ICON_CHOICES } from '@/constants/defaults';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

type Mode = 'menu' | 'rename' | 'icon';

type RoomActionsSheetProps = {
  room: string | null;
  onClose: () => void;
};

export function RoomActionsSheet({ room, onClose }: RoomActionsSheetProps) {
  const t = useTheme();
  const { roomCounts, iconForRoom, renameRoom, deleteRoom, setRoomIcon } = useItemsStore();
  const [mode, setMode] = useState<Mode>('menu');
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (room) {
      setMode('menu');
      setRenameInput(room);
      setRenameError(null);
    }
  }, [room]);

  if (!room) return null;

  const count = roomCounts[room] ?? 0;

  const handleDelete = () => {
    if (count > 0) {
      Alert.alert(
        'Empty this room first',
        `${count} item${count === 1 ? '' : 's'} still stashed here — move or delete ${
          count === 1 ? 'it' : 'them'
        } before removing the room.`
      );
      return;
    }
    Alert.alert('Delete this room?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteRoom(room);
          onClose();
        },
      },
    ]);
  };

  const handleSaveRename = () => {
    const trimmed = renameInput.trim();
    if (trimmed === room) {
      onClose();
      return;
    }
    if (!trimmed) {
      setRenameError('Enter a name');
      return;
    }
    const ok = renameRoom(room, trimmed);
    if (!ok) {
      setRenameError('That name is already taken');
      return;
    }
    onClose();
  };

  const handlePickIcon = (icon: string) => {
    setRoomIcon(room, icon);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* The rename field autoFocuses, so the keyboard is already up by
          the time this sheet finishes animating in. Without this the
          sheet stays pinned to the bottom of the screen and the input —
          and the Save button under it — sit behind the keyboard, with no
          way to scroll them into view. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.tile, borderColor: t.border }]}>
          <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
        {mode === 'menu' && (
          <>
            <View style={styles.header}>
              <Text style={styles.headerIcon}>{iconForRoom(room)}</Text>
              <Text style={[styles.headerTitle, { color: t.ink }]}>{room}</Text>
            </View>

            <Pressable style={styles.row} onPress={() => setMode('rename')}>
              <Text style={[styles.rowText, { color: t.ink }]}>Rename</Text>
            </Pressable>
            <Pressable style={styles.row} onPress={() => setMode('icon')}>
              <Text style={[styles.rowText, { color: t.ink }]}>Change icon</Text>
            </Pressable>
            <Pressable style={styles.row} onPress={handleDelete}>
              <Text style={[styles.rowText, { color: t.danger }]}>Delete room</Text>
            </Pressable>

            <Pressable style={[styles.cancelRow, { borderColor: t.border }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: t.sub }]}>Cancel</Text>
            </Pressable>
          </>
        )}

        {mode === 'rename' && (
          <>
            <Pressable onPress={() => setMode('menu')}>
              <Text style={[styles.back, { color: t.sub }]}>{'← Back'}</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: t.ink, marginTop: 12 }]}>Rename room</Text>
            <TextInput
              value={renameInput}
              onChangeText={(v) => {
                setRenameInput(v);
                setRenameError(null);
              }}
              autoFocus
              maxLength={100}
              style={[styles.input, { borderColor: t.border, color: t.ink, backgroundColor: t.tileAlt }]}
              placeholderTextColor={t.sub}
            />
            {renameError && <Text style={[styles.error, { color: t.danger }]}>{renameError}</Text>}
            <Pressable
              onPress={handleSaveRename}
              style={[styles.saveButton, { backgroundColor: t.accent }]}>
              <Text style={[styles.saveButtonText, { color: t.accentInk }]}>Save</Text>
            </Pressable>
          </>
        )}

        {mode === 'icon' && (
          <>
            <Pressable onPress={() => setMode('menu')}>
              <Text style={[styles.back, { color: t.sub }]}>{'← Back'}</Text>
            </Pressable>
            <Text style={[styles.headerTitle, { color: t.ink, marginTop: 12 }]}>Choose an icon</Text>
            <View style={styles.iconGrid}>
              {ICON_CHOICES.map((icon) => (
                <Pressable
                  key={icon}
                  onPress={() => handlePickIcon(icon)}
                  style={[styles.iconOption, { backgroundColor: t.tileAlt, borderColor: t.border }]}>
                  <Text style={styles.iconOptionText}>{icon}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
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
    // Bottom-anchored, so content taller than the screen grows off the
    // top rather than clipping at the bottom. Capping it keeps the
    // backdrop tappable and lets the contents scroll instead.
    maxHeight: '88%',
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  headerIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: 18,
  },
  row: {
    paddingVertical: 14,
  },
  rowText: {
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
  back: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: Fonts.regular,
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: Fonts.regular,
  },
  saveButton: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  iconGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconOption: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionText: {
    fontSize: 24,
  },
});
