import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { LabelPath } from '@/components/label-path';
import { POSITIONS } from '@/constants/defaults';
import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

export default function AddItemScreen() {
  const { room: presetRoom, id } = useLocalSearchParams<{ room?: string; id?: string }>();
  const router = useRouter();
  const t = useTheme();
  // Remounts this screen when the system text size changes; see the
  // note on the home screen for why that is necessary.
  const { fontScale } = useLargeText();
  const { items, allRooms, spotsForRoom, addItem, updateItem, addRoom, addSpot, theme } = useItemsStore();

  const editingItem = id ? items.find((i) => i.id === id) : undefined;

  const [name, setName] = useState(editingItem?.name ?? '');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(editingItem?.room ?? presetRoom ?? null);
  const [spot, setSpot] = useState<string | null>(editingItem?.spot ?? null);
  const [pos, setPos] = useState<string | null>(editingItem?.pos ?? null);
  const [container, setContainer] = useState(editingItem?.container ?? '');
  const [note, setNote] = useState(editingItem?.note ?? '');
  const [newRoomInput, setNewRoomInput] = useState('');
  const [newSpotInput, setNewSpotInput] = useState('');

  const inputStyle = [
    styles.input,
    { borderColor: t.border, backgroundColor: theme === 'dark' ? t.tileAlt : t.tile, color: t.ink },
  ];

  const handleSelectRoom = (r: string) => {
    setSelectedRoom(r);
    setSpot(null);
  };

  const handleAddRoom = () => {
    const r = newRoomInput.trim();
    if (!r) return;
    addRoom(r);
    setSelectedRoom(r);
    setSpot(null);
    setNewRoomInput('');
  };

  const handleToggleSpot = (s: string) => {
    setSpot((current) => (current === s ? null : s));
  };

  const handleAddSpot = () => {
    if (!selectedRoom) return;
    const s = newSpotInput.trim();
    if (!s) return;
    addSpot(selectedRoom, s);
    setSpot(s);
    setNewSpotInput('');
  };

  const handleTogglePos = (p: string) => {
    setPos((current) => (current === p ? null : p));
  };

  const canSave = name.trim().length > 0 && !!selectedRoom;

  const handleSave = () => {
    if (!canSave || !selectedRoom) return;
    const input = {
      name: name.trim(),
      room: selectedRoom,
      spot,
      pos,
      container: container.trim(),
      note: note.trim(),
    };
    if (editingItem) {
      updateItem(editingItem.id, input);
    } else {
      addItem(input);
    }
    router.dismissAll();
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['bottom']}>
      <Stack.Screen options={{ title: editingItem ? 'Edit Item' : 'Add Item' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView key={fontScale} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[baseTileStyle(t, theme), styles.panel]}>
            <Field label="What is it?">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Passport, spare Fire Stick remote"
                placeholderTextColor={t.sub}
                autoFocus
                maxLength={200}
                style={inputStyle}
              />
            </Field>

            <Field label="Room">
              <View style={styles.chipRow}>
                {allRooms.map((r) => (
                  <Chip key={r} label={r} active={selectedRoom === r} onPress={() => handleSelectRoom(r)} />
                ))}
              </View>
              <View style={styles.inlineAddRow}>
                <TextInput
                  value={newRoomInput}
                  onChangeText={setNewRoomInput}
                  placeholder="Add a room…"
                  placeholderTextColor={t.sub}
                  maxLength={100}
                  style={[styles.inlineInput, inputStyle]}
                />
                <Pressable onPress={handleAddRoom} style={[styles.inlineAddButton, { borderColor: t.border }]}>
                  <Text style={[styles.inlineAddButtonText, { color: t.ink }]}>Add</Text>
                </Pressable>
              </View>
            </Field>

            {selectedRoom && (
              <Field label={`Where in the ${selectedRoom.toLowerCase()}?`}>
                <View style={styles.chipRow}>
                  {spotsForRoom(selectedRoom).map((s) => (
                    <Chip key={s} label={s} active={spot === s} onPress={() => handleToggleSpot(s)} />
                  ))}
                </View>
                <View style={styles.inlineAddRow}>
                  <TextInput
                    value={newSpotInput}
                    onChangeText={setNewSpotInput}
                    placeholder="Add furniture or a spot…"
                    placeholderTextColor={t.sub}
                    maxLength={100}
                    style={[styles.inlineInput, inputStyle]}
                  />
                  <Pressable onPress={handleAddSpot} style={[styles.inlineAddButton, { borderColor: t.border }]}>
                    <Text style={[styles.inlineAddButtonText, { color: t.ink }]}>Add</Text>
                  </Pressable>
                </View>
              </Field>
            )}

            {spot && (
              <Field label="Exactly where?">
                <View style={styles.chipRow}>
                  {POSITIONS.map((p) => (
                    <Chip key={p} label={p} active={pos === p} onPress={() => handleTogglePos(p)} />
                  ))}
                </View>
              </Field>
            )}

            <Field label="In a container? (optional)">
              <TextInput
                value={container}
                onChangeText={setContainer}
                placeholder='e.g. "the blue box", "shoebox marked CABLES"'
                placeholderTextColor={t.sub}
                maxLength={200}
                style={inputStyle}
              />
            </Field>

            <Field label="Note (optional)">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="e.g. behind the winter coats"
                placeholderTextColor={t.sub}
                maxLength={2000}
                style={inputStyle}
              />
            </Field>

            {selectedRoom || container ? (
              <View style={[styles.previewBox, { backgroundColor: t.tileAlt, borderColor: t.border }]}>
                <Text style={[styles.previewLabel, { color: t.sub }]}>The label</Text>
                <LabelPath parts={[selectedRoom, spot, pos, container]} size="md" />
              </View>
            ) : null}

            <View style={styles.footerRow}>
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={[styles.saveButton, { backgroundColor: t.accent }, !canSave && styles.saveButtonDisabled]}>
                <Text style={[styles.saveButtonText, { color: t.accentInk }]}>
                  {editingItem ? 'Save changes' : 'Save the spot'}
                </Text>
              </Pressable>
              <Pressable onPress={() => router.back()} style={[styles.cancelButton, { borderColor: t.border }]}>
                <Text style={[styles.cancelButtonText, { color: t.ink }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
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
  },
  content: {
    padding: 16,
  },
  panel: {
    padding: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: Fonts.regular,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  inlineInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
  },
  inlineAddButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  inlineAddButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  previewBox: {
    marginBottom: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 12,
  },
  previewLabel: {
    marginBottom: 6,
    fontFamily: Fonts.regular,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  saveButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  cancelButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
});
