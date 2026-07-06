import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { LabelPath } from '@/components/label-path';
import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useTheme();
  const { items, deleteItem, theme } = useItemsStore();

  const item = items.find((i) => i.id === id);

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
            </Text>

            <View style={styles.actions}>
              <Pressable
                onPress={() => router.push({ pathname: '/add', params: { id: item.id } })}
                style={[styles.primaryButton, { backgroundColor: t.accent }]}>
                <Text style={[styles.primaryButtonText, { color: t.accentInk }]}>It moved — update</Text>
              </Pressable>
              <Pressable onPress={handleDelete} style={[styles.deleteButton, { borderColor: t.border }]}>
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
