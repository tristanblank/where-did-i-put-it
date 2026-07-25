import AsyncStorage from '@react-native-async-storage/async-storage';

const OUTBOX_KEY = 'stasher:outbox';

export type OutboxTable = 'items' | 'custom_rooms' | 'custom_spots' | 'room_meta';

// dirty[table] holds keys pending a push to Supabase — an item's id for
// `items`, or a composite string key for the room-metadata tables, which
// don't have a natural single-column id (see items-store.tsx's keyFor()).
type OutboxState = Record<OutboxTable, string[]>;

const empty = (): OutboxState => ({ items: [], custom_rooms: [], custom_spots: [], room_meta: [] });

let state: OutboxState = empty();
let loaded = false;
let loadPromise: Promise<void> | null = null;
let saveQueue: Promise<void> = Promise.resolve();

async function ensureLoaded() {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(OUTBOX_KEY)
      .then((raw) => {
        if (raw) state = { ...empty(), ...JSON.parse(raw) };
      })
      .catch(() => {
        // fresh start
      })
      .finally(() => {
        loaded = true;
      });
  }
  await loadPromise;
}

function save() {
  saveQueue = saveQueue
    .then(() => AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(state)))
    .catch((e) => console.error('Outbox save failed', e));
}

export async function markDirty(table: OutboxTable, key: string) {
  await ensureLoaded();
  if (!state[table].includes(key)) {
    state[table] = [...state[table], key];
    save();
  }
}

export async function clearDirty(table: OutboxTable, key: string) {
  await ensureLoaded();
  if (state[table].includes(key)) {
    state[table] = state[table].filter((k) => k !== key);
    save();
  }
}

export async function getDirtyKeys(table: OutboxTable): Promise<string[]> {
  await ensureLoaded();
  return state[table];
}

export async function hasAnyDirty(): Promise<boolean> {
  await ensureLoaded();
  return (Object.keys(state) as OutboxTable[]).some((table) => state[table].length > 0);
}

// Account deletion only -- wipes pending writes along with everything else
// local, so a future sign-in on this device (a different account, or a
// fresh one) doesn't try to push a dead account's queued changes.
export async function clearOutboxState() {
  await ensureLoaded();
  state = empty();
  await AsyncStorage.removeItem(OUTBOX_KEY);
}
