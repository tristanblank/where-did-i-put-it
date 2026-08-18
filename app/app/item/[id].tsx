import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { LabelPath } from '@/components/label-path';
import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useHouseholdMembers } from '@/hooks/use-household-members';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const { items, deleteItem, theme } = useItemsStore();
  const { nameFor } = useHouseholdMembers();
  const { isLarge } = useLargeText();

  const item = items.find((i) => i.id === id);
  // Null for anything added before this device synced, and briefly for a
  // just-added item whose server row hasn't echoed back yet. Both cases
  // render nothing rather than an "Added by unknown" placeholder.
  const addedBy = item ? nameFor(item.createdBy) : null;

  const handleDelete = () => {
    Alert.alert('Delete this item?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.dismissAll();
          deleteItem(id);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['bottom']}>
      <Stack.Screen options={{ title: item?.name ?? 'Item' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {!item ? (
          <Text style={[styles.notFound, { color: t.sub }]}>{"This item couldn't be found."}</Text>
        ) : (
          <View style={[baseTileStyle(t, theme), styles.panel]}>
            <Text style={[styles.name, { color: t.ink }]}>{item.name}</Text>
            <LabelPath parts={[item.room, item.spot, item.pos, item.container]} size="md" />
            {item.note ? <Text style={[styles.note, { color: t.sub }]}>{item.note}</Text> : null}
            <Text style={[styles.updatedAt, { color: t.sub }]}>
              Last updated {new Date(item.updatedAt).toLocaleString()}
              {addedBy ? ` · Added by ${addedBy}` : ''}
            </Text>

            {/* Side by side, the primary button gets whatever "Delete"
                doesn't need, which at large text sizes clipped the label
                to its first few characters. Stacked, both get the full
                width. Still needed with the shorter label — "Delete" is
                what squeezes, and it doesn't get narrower. */}
            <View style={[styles.actions, isLarge && styles.actionsStacked]}>
              <Pressable
                onPress={() => router.push({ pathname: '/add', params: { id: item.id } })}
                style={[styles.primaryButton, isLarge && styles.buttonStacked, { backgroundColor: t.accent }]}>
                <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>Move/Update</Text>
              </Pressable>
              <Pressable onPress={handleDelete} style={[styles.deleteButton, isLarge && styles.buttonStacked, { borderColor: t.border }]}>
                <Text style={[styles.deleteButtonText, { color: t.danger }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  notFound: {
    marginTop: 32,
    fontSize: 14,
    textAlign: 'center',
  },
  panel: {
    padding: 24,
  },
  name: {
    marginBottom: 12,
    fontFamily: Fonts.bold,
    fontSize: 22,
  },
  note: {
    marginTop: 12,
    fontSize: 14,
  },
  updatedAt: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: 11,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 8,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  // flex: 1 means "take the leftover width" in a row and "take the
  // leftover height" in a column, so it has to be turned off when these
  // stack or the top button stretches to fill the panel.
  buttonStacked: {
    flex: 0,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
});
