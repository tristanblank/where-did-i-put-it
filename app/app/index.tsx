import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { AddRoomSheet } from '@/components/add-room-sheet';
import { Chip } from '@/components/chip';
import { HouseholdSheet } from '@/components/household-sheet';
import { ItemCard } from '@/components/item-card';
import { LabelPath } from '@/components/label-path';
import { RoomActionsSheet } from '@/components/room-actions-sheet';
import { Fonts } from '@/constants/theme';
import { baseTileStyle } from '@/constants/tile-style';
import { useLargeText } from '@/hooks/use-large-text';
import { useTheme } from '@/hooks/use-theme';
import { useItemsStore } from '@/lib/items-store';

export default function HomeScreen() {
  const router = useRouter();
  const t = useTheme();
  const { items, sortedItems, allRooms, roomCounts, iconForRoom, theme, toggleTheme, roomSort, setRoomSort } =
    useItemsStore();
  const [query, setQuery] = useState('');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [householdSheetOpen, setHouseholdSheetOpen] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const { isLarge, fontScale } = useLargeText();
  const longPressTriggered = useRef(false);

  const bentoRooms = useMemo(() => {
    const withCounts = allRooms.map((room) => ({ room, count: roomCounts[room] ?? 0 }));
    if (roomSort === 'alpha') {
      withCounts.sort((a, b) => a.room.localeCompare(b.room));
    } else {
      withCounts.sort((a, b) => b.count - a.count || a.room.localeCompare(b.room));
    }
    return withCounts;
  }, [allRooms, roomCounts, roomSort]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return sortedItems.filter((item) =>
      [item.name, item.room, item.spot, item.pos, item.container, item.note]
        .filter((f): f is string => Boolean(f))
        .some((f) => f.toLowerCase().includes(q))
    );
  }, [sortedItems, query]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]} edges={['top']}>
      {/* Keyed on fontScale so a text-size change remounts the tree.
          Without it, headings rendered as clipped slivers: a Text whose
          own props don't change is skipped on re-render — the React
          Compiler memoizes these aggressively — so its native view keeps
          the height it was measured at under the old font size while the
          glyphs inside it get bigger. Everything that *did* re-render
          (the tiles, which take isLarge in their style) measured
          correctly, which is exactly the split the screenshots showed.
          Remounting is blunt, but it re-measures everything and costs a
          scroll position on an action nobody takes twice in a session. */}
      <ScrollView key={fontScale} contentContainerStyle={styles.content}>
        {/* A row at default size; a stack once the title is wide enough to
            shove the buttons off the edge. Those buttons are the only way
            into the household sheet, which is the only way to delete an
            account — losing them offscreen isn't cosmetic. */}
        <View style={[styles.headerRow, isLarge && styles.headerRowStacked]}>
          <View style={styles.headerTitleGroup}>
            <Text style={[styles.eyebrow, { color: t.accent }]}>Household index</Text>
            <Text style={[styles.title, { color: t.ink }]}>Stasher</Text>
          </View>
          <View style={styles.headerButtons}>
            <Pressable
              onPress={() => setHouseholdSheetOpen(true)}
              style={[baseTileStyle(t, theme), styles.themeToggle]}>
              <Text allowFontScaling={false} style={styles.themeToggleIcon}>👥</Text>
            </Pressable>
            <Pressable onPress={toggleTheme} style={[baseTileStyle(t, theme), styles.themeToggle]}>
              <Text allowFontScaling={false} style={styles.themeToggleIcon}>{theme === 'light' ? '🌙' : '☀️'}</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search items, boxes, shelves…"
          placeholderTextColor={t.sub}
          style={[
            styles.searchInput,
            { borderColor: t.border, backgroundColor: theme === 'dark' ? t.tileAlt : t.tile, color: t.ink },
          ]}
        />

        {searchResults ? (
          searchResults.length === 0 ? (
            <View style={[baseTileStyle(t, theme), styles.noMatchesTile]}>
              <Text style={[styles.noMatchesTitle, { color: t.ink }]}>No matches</Text>
              <Text style={[styles.noMatchesBody, { color: t.sub }]}>
                Try a different word — maybe you filed it under the box, not the item.
              </Text>
            </View>
          ) : (
            <View style={styles.resultsList}>
              {searchResults.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
                />
              ))}
            </View>
          )
        ) : (
          <>
            {/* Same problem as the header: the label grows and pushes the
                chips past the right edge, where they can't be tapped. */}
            <View style={[styles.sortRow, isLarge && styles.sortRowStacked]}>
              <Text style={[styles.sortLabel, { color: t.sub }]}>Sort rooms</Text>
              <View style={styles.sortPills}>
                <Chip label="By count" active={roomSort === 'count'} onPress={() => setRoomSort('count')} />
                <Chip label="A–Z" active={roomSort === 'alpha'} onPress={() => setRoomSort('alpha')} />
              </View>
            </View>

            <View style={styles.grid}>
              <View style={[baseTileStyle(t, theme), styles.statTile, isLarge && styles.fullWidthTile, { backgroundColor: t.accent, borderWidth: 0 }]}>
                <Text style={[styles.statNumber, { color: t.accentInk }]}>{items.length}</Text>
                <Text style={[styles.statLabel, { color: t.accentInk }]}>Things stashed</Text>
              </View>

              <Pressable onPress={() => router.push('/add')} style={[baseTileStyle(t, theme), styles.addTile, isLarge && styles.fullWidthTile]}>
                <Text allowFontScaling={false} style={styles.addIcon}>➕</Text>
                <Text style={[styles.addLabel, { color: t.ink }]}>Stash something</Text>
              </Pressable>

              {bentoRooms.map(({ room, count }) => (
                <Pressable
                  key={room}
                  onPressIn={() => {
                    longPressTriggered.current = false;
                  }}
                  onLongPress={() => {
                    longPressTriggered.current = true;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setActiveRoom(room);
                  }}
                  delayLongPress={450}
                  onPress={() => {
                    if (longPressTriggered.current) {
                      longPressTriggered.current = false;
                      return;
                    }
                    router.push({ pathname: '/room/[room]', params: { room } });
                  }}
                  style={[baseTileStyle(t, theme), styles.smallRoomTile, isLarge && styles.fullWidthTile]}>
                  <View>
                    <Text allowFontScaling={false} style={{ fontSize: 22 }}>{iconForRoom(room)}</Text>
                    <View style={styles.roomNameGroup}>
                      <Text style={[styles.roomName, { color: t.ink }]}>{room}</Text>
                    </View>
                  </View>
                  <View style={[styles.countBadge, { backgroundColor: count ? t.accentSoft : t.tileAlt }]}>
                    <Text style={[styles.countText, { color: count ? t.accent : t.sub }]}>{count}</Text>
                  </View>
                </Pressable>
              ))}

              {/* Sits after the rooms rather than beside "Stash something",
                  so the grid still leads with the two things done most
                  often and this reads as the end of the room list. */}
              <Pressable
                onPress={() => setAddRoomOpen(true)}
                style={[baseTileStyle(t, theme), styles.smallRoomTile, isLarge && styles.fullWidthTile]}>
                <View>
                  <Text allowFontScaling={false} style={{ fontSize: 22 }}>➕</Text>
                  <View style={styles.roomNameGroup}>
                    <Text style={[styles.roomName, { color: t.sub }]}>Add a room</Text>
                  </View>
                </View>
              </Pressable>

              {sortedItems.length > 0 && (
                <View style={[baseTileStyle(t, theme), styles.recentTile]}>
                  {/* Sorted by updated_at, not created — so an item that
                      someone moved surfaces here too, which is the more
                      useful signal in a shared household and worth naming
                      honestly. */}
                  <Text style={[styles.recentLabel, { color: t.sub }]}>Recent updates</Text>
                  <View style={styles.recentList}>
                    {sortedItems.slice(0, 3).map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}>
                        <Text style={[styles.recentItemName, { color: t.ink }]}>{item.name}</Text>
                        <LabelPath parts={[item.room, item.spot, item.pos, item.container]} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {items.length === 0 && (
              <View
                style={[
                  baseTileStyle(t, theme),
                  styles.emptyHint,
                  { borderStyle: 'dashed', borderColor: t.border, shadowOpacity: 0, elevation: 0 },
                ]}>
                <Text style={[styles.emptyHintText, { color: t.sub }]}>
                  Log the passport, the spare keys, the HDMI cables — future you says thanks.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
      <RoomActionsSheet room={activeRoom} onClose={() => setActiveRoom(null)} />
      <HouseholdSheet visible={householdSheetOpen} onClose={() => setHouseholdSheetOpen(false)} />
      <AddRoomSheet visible={addRoomOpen} onClose={() => setAddRoomOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  // Lets the title shrink and wrap instead of pushing its siblings off the
  // screen — a row child sizes to its content unless told otherwise.
  headerTitleGroup: {
    flexShrink: 1,
  },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  // No explicit lineHeight on anything that scales. React Native applies
  // fontScale to fontSize but leaves a hard-coded lineHeight exactly where
  // it is, so at the largest text sizes an 81pt glyph gets squeezed into a
  // 30pt line box and renders as a clipped sliver. Letting the platform
  // derive it from the final font size is the only thing that holds at
  // every size.
  title: {
    fontFamily: Fonts.bold,
    fontSize: 26,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  themeToggle: {
    borderRadius: 999,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleIcon: {
    fontSize: 18,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Fonts.regular,
    marginBottom: 16,
  },
  noMatchesTile: {
    padding: 32,
    alignItems: 'center',
  },
  noMatchesTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  noMatchesBody: {
    marginTop: 4,
    fontSize: 14,
    textAlign: 'center',
  },
  resultsList: {
    gap: 10,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sortRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  sortLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sortPills: {
    flexDirection: 'row',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  // One column once text is large. Two 48%-wide tiles leave each label
  // about half a phone wide, which is where "THINGS STASHED" starts
  // breaking mid-word into "STASHE / D".
  fullWidthTile: {
    width: '100%',
  },
  statTile: {
    width: '48%',
    minHeight: 96,
    padding: 16,
    justifyContent: 'space-between',
  },
  statNumber: {
    fontFamily: Fonts.bold,
    fontSize: 34,
  },
  statLabel: {
    marginTop: 4,
    fontFamily: Fonts.regular,
    fontSize: 10.5,
    letterSpacing: 0.84,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  addTile: {
    width: '48%',
    minHeight: 96,
    padding: 16,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  addIcon: {
    fontSize: 24,
  },
  addLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  smallRoomTile: {
    width: '48%',
    minHeight: 96,
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
  },
  roomNameGroup: {
    marginTop: 8,
  },
  roomName: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
  },
  countBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontFamily: Fonts.semiBold,
    fontSize: 11,
  },
  recentTile: {
    width: '100%',
    padding: 16,
  },
  recentLabel: {
    marginBottom: 12,
    fontFamily: Fonts.semiBold,
    fontSize: 10.5,
    letterSpacing: 1.05,
    textTransform: 'uppercase',
  },
  recentList: {
    gap: 12,
  },
  recentItemName: {
    marginBottom: 4,
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
  emptyHint: {
    marginTop: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyHintText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
