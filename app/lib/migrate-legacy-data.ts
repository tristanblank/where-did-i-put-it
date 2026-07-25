import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { Item } from '@/lib/items-store';
import { supabase } from '@/lib/supabase';

const LEGACY_KEY = 'stasher:data';
const MIGRATION_FLAG_KEY = 'stasher:migration:v1:done';

export type MigrationResult = {
  items: Item[];
  customRooms: string[];
  customSpots: Record<string, string[]>;
  hiddenRooms: string[];
  roomIcons: Record<string, string>;
};

type LegacyData = {
  // Old ids were a base36 timestamp+counter string, not a UUID, but
  // otherwise legacy items are shaped identically to today's Item.
  items?: Item[];
  customRooms?: string[];
  customSpots?: Record<string, string[]>;
  hiddenRooms?: string[];
  roomIcons?: Record<string, string>;
};

// One-time push of a device's pre-Phase-4 local data into a freshly created
// household. Called only right after create_household succeeds (never on
// join — a joining spouse should see the household's existing data, not
// have her own empty local state overwrite it). Idempotent: a missing
// legacy key (a fresh install that never ran Phase 3) or an already-set
// migration flag both make this a no-op, not a special case to branch on.
export async function migrateLegacyLocalData(householdId: string, userId: string): Promise<MigrationResult | null> {
  const alreadyDone = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
  if (alreadyDone) return null;

  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (!raw) {
    await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return null;
  }

  const legacy: LegacyData = JSON.parse(raw);

  // Local ids were never real UUIDs (a base36 timestamp+counter scheme
  // pre-Phase-4), but items.id is a uuid column — assign fresh ones now,
  // for both the Supabase rows and the local cache going forward, so the
  // two stay keyed identically from this point on.
  const legacyItems = legacy.items ?? [];
  const migratedItems: Item[] = legacyItems.map((item) => ({ ...item, id: Crypto.randomUUID() }));

  if (migratedItems.length > 0) {
    const rows = migratedItems.map((item) => ({
      id: item.id,
      household_id: householdId,
      name: item.name,
      room: item.room,
      spot: item.spot,
      pos: item.pos,
      container: item.container,
      note: item.note,
      created_by: userId,
    }));
    const { error } = await supabase.from('items').insert(rows);
    if (error) throw error;
  }

  const customRooms = legacy.customRooms ?? [];
  const customSpots = legacy.customSpots ?? {};
  const hiddenRooms = legacy.hiddenRooms ?? [];
  const roomIcons = legacy.roomIcons ?? {};

  if (customRooms.length > 0) {
    const { error } = await supabase
      .from('custom_rooms')
      .upsert(
        customRooms.map((name) => ({ household_id: householdId, name })),
        { onConflict: 'household_id,name' }
      );
    if (error) throw error;
  }

  const spotRows = Object.entries(customSpots).flatMap(([room, names]) =>
    names.map((name) => ({ household_id: householdId, room, name }))
  );
  if (spotRows.length > 0) {
    const { error } = await supabase
      .from('custom_spots')
      .upsert(spotRows, { onConflict: 'household_id,room,name' });
    if (error) throw error;
  }

  const roomsWithMeta = new Set([...hiddenRooms, ...Object.keys(roomIcons)]);
  const roomMetaRows = Array.from(roomsWithMeta).map((room) => ({
    household_id: householdId,
    room,
    icon: roomIcons[room] ?? null,
    hidden: hiddenRooms.includes(room),
  }));
  if (roomMetaRows.length > 0) {
    const { error } = await supabase.from('room_meta').upsert(roomMetaRows, { onConflict: 'household_id,room' });
    if (error) throw error;
  }

  await AsyncStorage.setItem(MIGRATION_FLAG_KEY, '1');

  // theme/roomSort are intentionally not migrated — genuine per-device
  // preferences, not household data.
  return { items: migratedItems, customRooms, customSpots, hiddenRooms, roomIcons };
}

// Account deletion only -- lets a future sign-in on this device re-run the
// legacy migration rather than silently no-op'ing against a flag left over
// from the deleted account.
export async function resetMigrationFlag() {
  await AsyncStorage.removeItem(MIGRATION_FLAG_KEY);
}
