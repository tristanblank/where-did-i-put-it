import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { DEFAULT_ROOMS, ROOM_ICONS } from '@/constants/defaults';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';
import { clearDirty, getDirtyKeys, markDirty, type OutboxTable } from '@/lib/sync/outbox';
import { filterReconcilable } from '@/lib/sync/reconcile';
import { subscribeToHousehold, type CustomRoomRow, type CustomSpotRow, type ItemRow, type RoomMetaRow } from '@/lib/sync/realtime';

export type Item = {
  id: string;
  name: string;
  room: string;
  spot: string | null;
  pos: string | null;
  container: string;
  note: string;
  updatedAt: number;
};

export type NewItemInput = {
  name: string;
  room: string;
  spot: string | null;
  pos: string | null;
  container: string;
  note: string;
};

export type RoomSort = 'count' | 'alpha';

type PersistedData = {
  items: Item[];
  customRooms: string[];
  customSpots: Record<string, string[]>;
  hiddenRooms: string[];
  roomIcons: Record<string, string>;
  theme: 'light' | 'dark';
  roomSort: RoomSort;
};

type ItemsStore = {
  items: Item[];
  sortedItems: Item[];
  customRooms: string[];
  customSpots: Record<string, string[]>;
  allRooms: string[];
  roomCounts: Record<string, number>;
  theme: 'light' | 'dark';
  roomSort: RoomSort;
  loading: boolean;
  spotsForRoom: (room: string) => string[];
  iconForRoom: (room: string) => string;
  addItem: (input: NewItemInput) => void;
  updateItem: (id: string, input: NewItemInput) => void;
  deleteItem: (id: string) => void;
  addRoom: (name: string) => void;
  addSpot: (room: string, name: string) => void;
  renameRoom: (oldName: string, newName: string) => boolean;
  deleteRoom: (room: string) => void;
  setRoomIcon: (room: string, icon: string) => void;
  applyMigration: (data: {
    items: Item[];
    customRooms: string[];
    customSpots: Record<string, string[]>;
    hiddenRooms: string[];
    roomIcons: Record<string, string>;
  }) => void;
  toggleTheme: () => void;
  setRoomSort: (sort: RoomSort) => void;
};

const STORAGE_KEY = 'stasher:data';
const uid = () => Crypto.randomUUID();
const spotKey = (room: string, name: string) => `${room}::${name}`;

const ItemsContext = createContext<ItemsStore | null>(null);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { householdId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  const [customSpots, setCustomSpots] = useState<Record<string, string[]>>({});
  const [hiddenRooms, setHiddenRooms] = useState<string[]>([]);
  const [roomIcons, setRoomIcons] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>(systemScheme ?? 'light');
  const [roomSort, setRoomSortState] = useState<RoomSort>('count');

  // Mirrors the latest persisted-data snapshot, updated synchronously on every
  // mutation (not tied to React's render/commit timing). persist() reads and
  // writes through this ref instead of render-closure state, so two mutations
  // fired in quick succession can't silently clobber each other with stale data.
  const dataRef = useRef<PersistedData>({
    items: [],
    customSpots: {},
    customRooms: [],
    hiddenRooms: [],
    roomIcons: {},
    theme: systemScheme ?? 'light',
    roomSort: 'count',
  });
  // Chains writes so they hit AsyncStorage in call order, one at a time.
  const writeQueueRef = useRef(Promise.resolve());
  const flushingRef = useRef(false);
  const flushAgainRef = useRef(false);
  const householdIdRef = useRef<string | null>(householdId);
  householdIdRef.current = householdId;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data: Partial<PersistedData> = JSON.parse(raw);
          dataRef.current = { ...dataRef.current, ...data };
          setItems(data.items ?? []);
          setCustomSpots(data.customSpots ?? {});
          setCustomRooms(data.customRooms ?? []);
          setHiddenRooms(data.hiddenRooms ?? []);
          setRoomIcons(data.roomIcons ?? {});
          if (data.theme) setTheme(data.theme);
          if (data.roomSort) setRoomSortState(data.roomSort);
        }
      } catch {
        // fresh start
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = (over: Partial<PersistedData> = {}) => {
    const next = { ...dataRef.current, ...over };
    dataRef.current = next;
    writeQueueRef.current = writeQueueRef.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)))
      .catch((e) => {
        console.error('Save failed', e);
        Alert.alert('Save failed', "Your last change may not have been saved. Please try again.");
      });
  };

  // ---------- Household sync (outbox push) ----------
  // Local writes (above) are the fast, offline-proof path and never wait on
  // any of this. Sync is additive: mark the affected row dirty, then try to
  // push it in the background. No household yet → nothing to push to, skip
  // entirely (pure local mode, same as Phase 3).

  const flushTable = async (table: OutboxTable, hid: string) => {
    const keys = await getDirtyKeys(table);
    for (const key of keys) {
      try {
        if (table === 'items') {
          const item = dataRef.current.items.find((i) => i.id === key);
          if (item) {
            const { error } = await supabase.from('items').upsert({
              id: item.id,
              household_id: hid,
              name: item.name,
              room: item.room,
              spot: item.spot,
              pos: item.pos,
              container: item.container,
              note: item.note,
            });
            if (error) throw error;
          } else {
            const { error } = await supabase.from('items').delete().eq('id', key);
            if (error) throw error;
          }
        } else if (table === 'custom_rooms') {
          const exists = dataRef.current.customRooms.includes(key);
          if (exists) {
            const { error } = await supabase
              .from('custom_rooms')
              .upsert({ household_id: hid, name: key }, { onConflict: 'household_id,name' });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('custom_rooms')
              .delete()
              .eq('household_id', hid)
              .eq('name', key);
            if (error) throw error;
          }
        } else if (table === 'custom_spots') {
          const [room, name] = key.split('::');
          const exists = (dataRef.current.customSpots[room] ?? []).includes(name);
          if (exists) {
            const { error } = await supabase
              .from('custom_spots')
              .upsert({ household_id: hid, room, name }, { onConflict: 'household_id,room,name' });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('custom_spots')
              .delete()
              .eq('household_id', hid)
              .eq('room', room)
              .eq('name', name);
            if (error) throw error;
          }
        } else {
          const icon = dataRef.current.roomIcons[key] ?? null;
          const hidden = dataRef.current.hiddenRooms.includes(key);
          if (icon || hidden) {
            const { error } = await supabase
              .from('room_meta')
              .upsert({ household_id: hid, room: key, icon, hidden }, { onConflict: 'household_id,room' });
            if (error) throw error;
          } else {
            const { error } = await supabase.from('room_meta').delete().eq('household_id', hid).eq('room', key);
            if (error) throw error;
          }
        }
        await clearDirty(table, key);
      } catch (e) {
        console.error(`Sync failed for ${table}:${key}`, e);
        break; // stop draining this table; retried on the next flush trigger
      }
    }
  };

  const flushOutbox = async () => {
    const hid = householdIdRef.current;
    if (!hid) return;
    if (flushingRef.current) {
      flushAgainRef.current = true;
      return;
    }
    flushingRef.current = true;
    try {
      await flushTable('items', hid);
      await flushTable('custom_rooms', hid);
      await flushTable('custom_spots', hid);
      await flushTable('room_meta', hid);
    } finally {
      flushingRef.current = false;
      if (flushAgainRef.current) {
        flushAgainRef.current = false;
        flushOutbox();
      }
    }
  };

  const markDirtyAndFlush = (table: OutboxTable, key: string) => {
    if (!householdIdRef.current) return;
    markDirty(table, key).then(() => flushOutbox());
  };

  // Retry whenever there's a household to sync to: once when it first
  // becomes available, again on every app-foreground, and periodically as
  // a simple backstop (no exponential backoff — at 2-user scale, a flat
  // 30s retry while there's dirty data is simple and plenty).
  useEffect(() => {
    if (!householdId) return;
    flushOutbox();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushOutbox();
    });
    const interval = setInterval(() => flushOutbox(), 30000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  // ---------- Incoming changes (initial fetch + realtime) ----------
  // These read/write dataRef.current rather than the render-scoped state
  // variables above, for the same reason persist() does: this effect only
  // re-runs when householdId changes, so its closures would otherwise go
  // stale the moment any local mutation happens in between.

  const applyItemRow = (row: ItemRow) => {
    const incoming: Item = {
      id: row.id,
      name: row.name,
      room: row.room,
      spot: row.spot,
      pos: row.pos,
      container: row.container ?? '',
      note: row.note ?? '',
      updatedAt: new Date(row.updated_at).getTime(),
    };
    const current = dataRef.current.items;
    const idx = current.findIndex((i) => i.id === incoming.id);
    const next = idx === -1 ? [incoming, ...current] : current.map((i) => (i.id === incoming.id ? incoming : i));
    setItems(next);
    persist({ items: next });
  };

  const removeItemRow = (id: string) => {
    const next = dataRef.current.items.filter((i) => i.id !== id);
    setItems(next);
    persist({ items: next });
  };

  const applyCustomRoomRow = (name: string) => {
    if (dataRef.current.customRooms.includes(name)) return;
    const next = [...dataRef.current.customRooms, name];
    setCustomRooms(next);
    persist({ customRooms: next });
  };

  const removeCustomRoomRow = (name: string) => {
    const next = dataRef.current.customRooms.filter((r) => r !== name);
    setCustomRooms(next);
    persist({ customRooms: next });
  };

  const applyCustomSpotRow = (room: string, name: string) => {
    const existing = dataRef.current.customSpots[room] ?? [];
    if (existing.includes(name)) return;
    const next = { ...dataRef.current.customSpots, [room]: [...existing, name] };
    setCustomSpots(next);
    persist({ customSpots: next });
  };

  const removeCustomSpotRow = (room: string, name: string) => {
    const existing = dataRef.current.customSpots[room] ?? [];
    const next = { ...dataRef.current.customSpots, [room]: existing.filter((s) => s !== name) };
    setCustomSpots(next);
    persist({ customSpots: next });
  };

  const applyRoomMetaRow = (room: string, icon: string | null, hidden: boolean) => {
    const nextIcons = { ...dataRef.current.roomIcons };
    if (icon) nextIcons[room] = icon;
    else delete nextIcons[room];
    const nextHidden = hidden
      ? dataRef.current.hiddenRooms.includes(room)
        ? dataRef.current.hiddenRooms
        : [...dataRef.current.hiddenRooms, room]
      : dataRef.current.hiddenRooms.filter((r) => r !== room);
    setRoomIcons(nextIcons);
    setHiddenRooms(nextHidden);
    persist({ roomIcons: nextIcons, hiddenRooms: nextHidden });
  };

  const removeRoomMetaRow = (room: string) => {
    const nextIcons = { ...dataRef.current.roomIcons };
    delete nextIcons[room];
    const nextHidden = dataRef.current.hiddenRooms.filter((r) => r !== room);
    setRoomIcons(nextIcons);
    setHiddenRooms(nextHidden);
    persist({ roomIcons: nextIcons, hiddenRooms: nextHidden });
  };

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    // Realtime only streams changes from the moment of subscription
    // onward — without an initial fetch, a spouse joining a household
    // that already has items in it would see nothing until something
    // next changes.
    const bootstrap = async () => {
      const [itemsRes, roomsRes, spotsRes, metaRes] = await Promise.all([
        supabase.from('items').select('*').eq('household_id', householdId),
        supabase.from('custom_rooms').select('*').eq('household_id', householdId),
        supabase.from('custom_spots').select('*').eq('household_id', householdId),
        supabase.from('room_meta').select('*').eq('household_id', householdId),
      ]);
      if (cancelled) return;

      if (itemsRes.data) {
        const rows = await filterReconcilable('items', itemsRes.data, (r) => r.id);
        rows.forEach(applyItemRow);
      }
      if (roomsRes.data) {
        const rows = await filterReconcilable('custom_rooms', roomsRes.data, (r) => r.name);
        rows.forEach((r) => applyCustomRoomRow(r.name));
      }
      if (spotsRes.data) {
        const rows = await filterReconcilable('custom_spots', spotsRes.data, (r) => spotKey(r.room, r.name));
        rows.forEach((r) => applyCustomSpotRow(r.room, r.name));
      }
      if (metaRes.data) {
        const rows = await filterReconcilable('room_meta', metaRes.data, (r) => r.room);
        rows.forEach((r) => applyRoomMetaRow(r.room, r.icon, r.hidden));
      }
    };
    bootstrap();

    const channel = subscribeToHousehold(householdId, {
      onItems: async (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old.id;
          if (!id) return;
          const dirty = await getDirtyKeys('items');
          if (!dirty.includes(id)) removeItemRow(id);
        } else {
          const dirty = await getDirtyKeys('items');
          if (!dirty.includes(payload.new.id)) applyItemRow(payload.new);
        }
      },
      onCustomRooms: async (payload) => {
        if (payload.eventType === 'DELETE') {
          const name = payload.old.name;
          if (!name) return;
          const dirty = await getDirtyKeys('custom_rooms');
          if (!dirty.includes(name)) removeCustomRoomRow(name);
        } else {
          const dirty = await getDirtyKeys('custom_rooms');
          if (!dirty.includes(payload.new.name)) applyCustomRoomRow(payload.new.name);
        }
      },
      onCustomSpots: async (payload) => {
        if (payload.eventType === 'DELETE') {
          const { room, name } = payload.old;
          if (!room || !name) return;
          const dirty = await getDirtyKeys('custom_spots');
          if (!dirty.includes(spotKey(room, name))) removeCustomSpotRow(room, name);
        } else {
          const { room, name } = payload.new;
          const dirty = await getDirtyKeys('custom_spots');
          if (!dirty.includes(spotKey(room, name))) applyCustomSpotRow(room, name);
        }
      },
      onRoomMeta: async (payload) => {
        if (payload.eventType === 'DELETE') {
          const room = payload.old.room;
          if (!room) return;
          const dirty = await getDirtyKeys('room_meta');
          if (!dirty.includes(room)) removeRoomMetaRow(room);
        } else {
          const { room, icon, hidden } = payload.new;
          const dirty = await getDirtyKeys('room_meta');
          if (!dirty.includes(room)) applyRoomMetaRow(room, icon, hidden);
        }
      },
    });

    // Realtime's websocket gets suspended when the app backgrounds (screen
    // lock, app switch, etc.) — same underlying problem the outbox-flush
    // effect above solves for the push side. The stream only carries
    // changes from the moment a subscription is actively connected, so
    // anything that happened while backgrounded needs a fresh fetch to
    // catch up rather than relying on the socket reconnecting on its own.
    // filterReconcilable in bootstrap() already protects this device's own
    // unsynced dirty writes from being clobbered by a stale server row.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') bootstrap();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    persist({ theme: next });
  };

  const setRoomSort = (sort: RoomSort) => {
    setRoomSortState(sort);
    persist({ roomSort: sort });
  };

  const allRooms = useMemo(
    () => [...Object.keys(DEFAULT_ROOMS), ...customRooms].filter((r) => !hiddenRooms.includes(r)),
    [customRooms, hiddenRooms]
  );

  const spotsForRoom = (room: string) => [...(DEFAULT_ROOMS[room] ?? []), ...(customSpots[room] ?? [])];

  const iconForRoom = (room: string) => roomIcons[room] ?? ROOM_ICONS[room] ?? '🏠';

  const roomCounts = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach((i) => {
      c[i.room] = (c[i.room] ?? 0) + 1;
    });
    return c;
  }, [items]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => b.updatedAt - a.updatedAt), [items]);

  const addItem = (input: NewItemInput) => {
    const newItem = { id: uid(), ...input, updatedAt: Date.now() };
    const next = [newItem, ...items];
    setItems(next);
    persist({ items: next });
    markDirtyAndFlush('items', newItem.id);
  };

  const updateItem = (id: string, input: NewItemInput) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...input, updatedAt: Date.now() } : i));
    setItems(next);
    persist({ items: next });
    markDirtyAndFlush('items', id);
  };

  const deleteItem = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    persist({ items: next });
    markDirtyAndFlush('items', id);
  };

  const addRoom = (name: string) => {
    const r = name.trim();
    if (!r || allRooms.includes(r)) return;
    const nextRooms = [...customRooms, r];
    const nextHidden = hiddenRooms.filter((h) => h !== r);
    setCustomRooms(nextRooms);
    setHiddenRooms(nextHidden);
    persist({ customRooms: nextRooms, hiddenRooms: nextHidden });
    markDirtyAndFlush('custom_rooms', r);
  };

  const addSpot = (room: string, name: string) => {
    const s = name.trim();
    if (!s || !room || spotsForRoom(room).includes(s)) return;
    const nextSpots = { ...customSpots, [room]: [...(customSpots[room] ?? []), s] };
    setCustomSpots(nextSpots);
    persist({ customSpots: nextSpots });
    markDirtyAndFlush('custom_spots', spotKey(room, s));
  };

  // Renaming touches items + three room-metadata tables together — rather
  // than push each through the outbox separately (which could apply
  // out of order and leave the household briefly inconsistent), this calls
  // the same atomic rename_room() RPC the schema defines, best-effort. It's
  // rare enough that requiring connectivity for it (unlike item writes,
  // which must work offline in a signal-less closet) is a fine trade.
  const renameRoom = (oldName: string, newName: string) => {
    const n = newName.trim();
    if (!n || n === oldName || allRooms.includes(n)) return false;

    const nextSpots = { ...customSpots, [n]: spotsForRoom(oldName) };
    delete nextSpots[oldName];

    const icon = roomIcons[oldName] ?? ROOM_ICONS[oldName];
    const nextIcons = { ...roomIcons, [n]: icon ?? '🏠' };
    delete nextIcons[oldName];

    // If the new name reuses a built-in default room's name, let that hardcoded
    // entry serve the slot instead of adding a duplicate custom-room entry.
    const nextCustomRooms = DEFAULT_ROOMS[n]
      ? customRooms.filter((r) => r !== oldName)
      : [...customRooms.filter((r) => r !== oldName), n];
    const nextHidden = DEFAULT_ROOMS[oldName]
      ? [...hiddenRooms.filter((h) => h !== n), oldName]
      : hiddenRooms.filter((h) => h !== n);

    const nextItems = items.map((i) => (i.room === oldName ? { ...i, room: n } : i));

    setCustomSpots(nextSpots);
    setRoomIcons(nextIcons);
    setCustomRooms(nextCustomRooms);
    setHiddenRooms(nextHidden);
    setItems(nextItems);
    persist({
      customSpots: nextSpots,
      roomIcons: nextIcons,
      customRooms: nextCustomRooms,
      hiddenRooms: nextHidden,
      items: nextItems,
    });

    if (householdIdRef.current) {
      const warnRenameFailed = (e: unknown) => {
        console.error('Room rename failed to sync', e);
        Alert.alert(
          "Rename didn't sync",
          'The room was renamed on this phone, but syncing it to your household failed. Try again once you have a connection.'
        );
      };
      supabase.rpc('rename_room', { p_old_name: oldName, p_new_name: n }).then(({ error }) => {
        if (error) warnRenameFailed(error);
      }, warnRenameFailed);
    }
    return true;
  };

  const deleteRoom = (room: string) => {
    if ((roomCounts[room] ?? 0) > 0) return;

    const nextSpots = { ...customSpots };
    delete nextSpots[room];
    const nextIcons = { ...roomIcons };
    delete nextIcons[room];
    const nextCustomRooms = customRooms.filter((r) => r !== room);
    const nextHidden = DEFAULT_ROOMS[room] ? [...hiddenRooms, room] : hiddenRooms;

    setCustomSpots(nextSpots);
    setRoomIcons(nextIcons);
    setCustomRooms(nextCustomRooms);
    setHiddenRooms(nextHidden);
    persist({ customSpots: nextSpots, roomIcons: nextIcons, customRooms: nextCustomRooms, hiddenRooms: nextHidden });
    markDirtyAndFlush('custom_rooms', room);
    markDirtyAndFlush('room_meta', room);
  };

  const setRoomIcon = (room: string, icon: string) => {
    const nextIcons = { ...roomIcons, [room]: icon };
    setRoomIcons(nextIcons);
    persist({ roomIcons: nextIcons });
    markDirtyAndFlush('room_meta', room);
  };

  // Replaces local state wholesale with the result of the one-time legacy
  // migration (M5) — those rows are already pushed to Supabase by that
  // point, so this only needs to update the local cache to match, not
  // mark anything dirty for another round-trip.
  const applyMigration = (data: {
    items: Item[];
    customRooms: string[];
    customSpots: Record<string, string[]>;
    hiddenRooms: string[];
    roomIcons: Record<string, string>;
  }) => {
    setItems(data.items);
    setCustomRooms(data.customRooms);
    setCustomSpots(data.customSpots);
    setHiddenRooms(data.hiddenRooms);
    setRoomIcons(data.roomIcons);
    persist(data);
  };

  const value: ItemsStore = {
    items,
    sortedItems,
    customRooms,
    customSpots,
    allRooms,
    roomCounts,
    theme,
    roomSort,
    loading,
    spotsForRoom,
    iconForRoom,
    addItem,
    updateItem,
    deleteItem,
    addRoom,
    addSpot,
    renameRoom,
    deleteRoom,
    setRoomIcon,
    applyMigration,
    toggleTheme,
    setRoomSort,
  };

  return <ItemsContext.Provider value={value}>{children}</ItemsContext.Provider>;
}

export function useItemsStore() {
  const ctx = useContext(ItemsContext);
  if (!ctx) throw new Error('useItemsStore must be used within an ItemsProvider');
  return ctx;
}
