import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ItemCard } from '@/components/item-card';
import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

export default function RoomScreen() {
  const { room } = useLocalSearchParams<{ room: string }>();
  const router = useRouter();
  const t = useTheme();
  // Remounts this screen when the system text size changes; see the
  // note on the home screen for why that is necessary.
  const { fontScale } = useLargeText();
  const { sortedItems, iconForRoom, theme } = useItemsStore();

  const roomItems = sortedItems.filter((i) => i.room === room);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['bottom']}>
      <Stack.Screen options={{ title: room }} />
      <ScrollView key={fontScale} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: t.ink }]}>
            {iconForRoom(room)} {room}
          </Text>
          <Pressable
            onPress={() => router.push({ pathname: '/add', params: { room } })}
            style={[styles.stashButton, { backgroundColor: t.accent }]}>
            <Text style={[styles.stashButtonText, { color: t.accentInk }]}>+ Stash here</Text>
          </Pressable>
        </View>

        {roomItems.length === 0 ? (
          <View style={[baseTileStyle(t, theme), styles.emptyTile]}>
            <Text style={[styles.emptyText, { color: t.sub }]}>
              Nothing logged in the {room.toLowerCase()} yet.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {roomItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              />
            ))}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 21,
  },
  stashButton: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stashButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  emptyTile: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    gap: 10,
  },
});
