import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';

import { DEFAULT_ROOMS, ROOM_ICONS } from '@/constants/defaults';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/lib/auth-store';
import { resetMigrationFlag } from '@/lib/migrate-legacy-data';
import { supabase } from '@/lib/supabase';
import { clearDirty, clearOutboxState, getDirtyKeys, markDirty, type OutboxTable } from '@/lib/sync/outbox';
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
  // Null for items added before this synced (legacy migration rows aside)
  // and for anything created offline that hasn't round-tripped yet — the
  // value is assigned by a column default server-side, so the client
  // can't know it until the row comes back.
  createdBy: string | null;
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
  clearLocalData: () => Promise<void>;
  toggleTheme: () => void;
  setRoomSort: (sort: RoomSort) => void;
};

const STORAGE_KEY = 'stasher:data';
const uid = () => Crypto.randomUUID();
const spotKey = (room: string, name: string) => `${room}::${name}`;

// Does retrying this error stand any chance of a different outcome?
//
// A dropped connection, a 5xx, a timeout: yes, retry forever, that's what
// the outbox is for. A constraint violation or a policy rejection: no —
// the row will be refused identically every time, and since flushTable
// stops draining a table at its first failure, one such row silently
// wedges every later write to that table for the life of the install.
//
// Postgres SQLSTATE classes 22 (data exception), 23 (integrity
// constraint) and 42 (access rule violation, which is where an RLS denial
// lands) are the permanent ones. PostgREST's own PGRST* codes are request
// -shaped problems and equally not worth retrying. Anything else —
// including an error with no code at all, which is what a network throw
// looks like — is treated as transient.
const PERMANENT_SQLSTATE_CLASSES = ['22', '23', '42'];

function isPermanentSyncError(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (typeof code !== 'string') return false;
  return code.startsWith('PGRST') || PERMANENT_SQLSTATE_CLASSES.includes(code.slice(0, 2));
}

const ItemsContext = createContext<ItemsStore | null>(null);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { householdId, session, initializing } = useAuth();
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
  // Counts permanently-rejected rows across one full flush, so the user
  // gets a single alert rather than one per wedged row.
  const droppedRef = useRef(0);
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

  // Snapshots the current local value for a dirty key, so a push can tell
  // whether the row it just sent is still what's locally current. Two
  // different-looking edits to the same item can otherwise both stringify
  // to distinct values while dirty is presence-only (markDirty no-ops if
  // already dirty) — comparing before vs. after is what lets a mid-flight
  // edit or delete survive a stale push instead of being clobbered by it.
  const snapshotFor = (table: OutboxTable, key: string): string | null => {
    if (table === 'items') {
      const item = dataRef.current.items.find((i) => i.id === key);
      return item ? JSON.stringify(item) : null;
    }
    if (table === 'custom_rooms') {
      return dataRef.current.customRooms.includes(key) ? key : null;
    }
    if (table === 'custom_spots') {
      const [room, name] = key.split('::');
      return (dataRef.current.customSpots[room] ?? []).includes(name) ? key : null;
    }
    const icon = dataRef.current.roomIcons[key] ?? null;
    const hidden = dataRef.current.hiddenRooms.includes(key);
    return icon || hidden ? JSON.stringify({ icon, hidden }) : null;
  };

  const flushTable = async (table: OutboxTable, hid: string) => {
    const keys = await getDirtyKeys(table);
    for (const key of keys) {
      const before = snapshotFor(table, key);
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
              // created_by is deliberately absent: it's a column default
              // of auth.uid() server-side. Sending it would mean sending
              // it on edits too — PostgREST's upsert does ON CONFLICT DO
              // UPDATE over every column in the payload — and the second
              // member to touch an item would take credit for adding it.
              // Omitted, the default applies on insert and the column is
              // left alone on update, which is the behaviour we want.
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
        // Only clear dirty if nothing changed locally while this push was
        // in flight. If it did, leave the key dirty — markDirty() is a
        // no-op on an already-dirty key, so this is the only thing that
        // keeps a newer edit (or a delete) from being silently dropped;
        // the next flush trigger re-reads dataRef.current fresh and sends
        // whatever's actually current.
        if (snapshotFor(table, key) === before) {
          await clearDirty(table, key);
        }
      } catch (e) {
        console.error(`Sync failed for ${table}:${key}`, e);
        if (!isPermanentSyncError(e)) {
          break; // transient; stop draining this table and retry on the next trigger
        }
        // Permanent. Retrying can only fail the same way, and leaving it
        // dirty would block every later write to this table behind it —
        // so drop it from the queue. The local copy stays; it's this
        // device's write that won't ever reach the household, which the
        // user needs telling about rather than discovering months later.
        await clearDirty(table, key);
        droppedRef.current += 1;
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
    droppedRef.current = 0;
    try {
      await flushTable('items', hid);
      await flushTable('custom_rooms', hid);
      await flushTable('custom_spots', hid);
      await flushTable('room_meta', hid);
    } finally {
      flushingRef.current = false;
      const dropped = droppedRef.current;
      if (dropped > 0) {
        Alert.alert(
          "Some changes didn't sync",
          `${dropped === 1 ? 'One change' : `${dropped} changes`} couldn't be saved to your household and ${dropped === 1 ? 'was' : 'were'} skipped. ${dropped === 1 ? "It's" : "They're"} still on this phone, but won't show up on other devices.`
        );
      }
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
      createdBy: row.created_by,
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

  // Removes local rows the server no longer has.
  //
  // Realtime only delivers events while the socket is actually connected,
  // and a backgrounded phone isn't connected — so any delete that happens
  // in that window is simply never seen. bootstrap() re-fetches on
  // foreground to catch up, but applying rows only ever adds and updates:
  // a row that's gone from the server produces no event to apply, so
  // without this the local copy keeps it forever. That's not a
  // theoretical gap; deleting rows straight from the database left them
  // sitting on a phone that had been backgrounded at the time.
  //
  // Dirty keys are skipped: a row created offline and not yet pushed is
  // legitimately absent from the server, and pruning it would delete the
  // user's own unsynced work. Callers must only invoke this with the rows
  // from a *successful* fetch — an errored request yields no data, and
  // treating that as "the server has nothing" would wipe the cache.
  const pruneMissing = async (
    table: OutboxTable,
    serverKeys: string[],
    localKeys: string[],
    remove: (key: string) => void
  ) => {
    const present = new Set(serverKeys);
    const dirty = new Set(await getDirtyKeys(table));
    for (const key of localKeys) {
      if (!present.has(key) && !dirty.has(key)) remove(key);
    }
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
        await pruneMissing(
          'items',
          itemsRes.data.map((r) => r.id),
          dataRef.current.items.map((i) => i.id),
          removeItemRow
        );
      }
      if (roomsRes.data) {
        const rows = await filterReconcilable('custom_rooms', roomsRes.data, (r) => r.name);
        rows.forEach((r) => applyCustomRoomRow(r.name));
        await pruneMissing(
          'custom_rooms',
          roomsRes.data.map((r) => r.name),
          [...dataRef.current.customRooms],
          removeCustomRoomRow
        );
      }
      if (spotsRes.data) {
        const rows = await filterReconcilable('custom_spots', spotsRes.data, (r) => spotKey(r.room, r.name));
        rows.forEach((r) => applyCustomSpotRow(r.room, r.name));
        await pruneMissing(
          'custom_spots',
          spotsRes.data.map((r) => spotKey(r.room, r.name)),
          Object.entries(dataRef.current.customSpots).flatMap(([room, names]) =>
            names.map((name) => spotKey(room, name))
          ),
          (key) => {
            const [room, name] = key.split('::');
            removeCustomSpotRow(room, name);
          }
        );
      }
      if (metaRes.data) {
        const rows = await filterReconcilable('room_meta', metaRes.data, (r) => r.room);
        rows.forEach((r) => applyRoomMetaRow(r.room, r.icon, r.hidden));
        // A room_meta row exists locally when the room has a custom icon
        // or is hidden — either one is enough, so the local key set is the
        // union rather than one list or the other.
        await pruneMissing(
          'room_meta',
          metaRes.data.map((r) => r.room),
          Array.from(new Set([...Object.keys(dataRef.current.roomIcons), ...dataRef.current.hiddenRooms])),
          removeRoomMetaRow
        );
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

  // Declared above allRooms, which now depends on it.
  const roomCounts = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach((i) => {
      c[i.room] = (c[i.room] ?? 0) + 1;
    });
    return c;
  }, [items]);

  // Known rooms, plus a safety net: any room an item actually points at,
  // even if nothing says that room exists.
  //
  // A room "existing" is otherwise decided by three separate things — the
  // DEFAULT_ROOMS constant, the custom_rooms table, and room_meta.hidden —
  // while items.room is free text the server never validates. So a row can
  // reference a room that renders nowhere, and the home screen derives its
  // tiles from this list, which means those items vanish from the app
  // while sitting perfectly intact in the database.
  //
  // That's not hypothetical; renaming a built-in room did exactly this.
  // Those paths are fixed, but the same shape reappears the moment
  // DEFAULT_ROOMS itself changes: rename or drop a default in a later
  // version and every household's items in it are suddenly orphaned, with
  // no user action to blame. Including item-referenced rooms unconditionally
  // makes that degrade into "an unexpected room appears" instead of
  // "my things are gone" — the difference between a cosmetic bug and a
  // support email about lost data.
  const allRooms = useMemo(() => {
    const known = [...Object.keys(DEFAULT_ROOMS), ...customRooms].filter((r) => !hiddenRooms.includes(r));
    const referenced = Object.keys(roomCounts);
    return Array.from(new Set([...known, ...referenced]));
  }, [customRooms, hiddenRooms, roomCounts]);

  const spotsForRoom = (room: string) => [...(DEFAULT_ROOMS[room] ?? []), ...(customSpots[room] ?? [])];

  const iconForRoom = (room: string) => roomIcons[room] ?? ROOM_ICONS[room] ?? '🏠';

  const sortedItems = useMemo(() => [...items].sort((a, b) => b.updatedAt - a.updatedAt), [items]);

  const addItem = (input: NewItemInput) => {
    // Set locally as well as defaulted server-side, and the two agree
    // without a round-trip: this device is the one inserting the row, so
    // auth.uid() in the column default resolves to exactly this user.
    //
    // Waiting for the server's value instead doesn't work. The push
    // marks the row dirty, and the realtime echo of our own insert is
    // dropped by the dirty-key check below — that check is what stops a
    // stale echo clobbering an unsent local edit, and it can't tell the
    // difference between that and the row we're waiting on. So the value
    // wouldn't land until the next bootstrap, and the item would sit
    // there unattributed until the app was next foregrounded.
    const newItem = { id: uid(), ...input, updatedAt: Date.now(), createdBy: session?.user.id ?? null };
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
    // Adding back a room whose name matches a built-in is an unhide, not
    // a new custom room. allRooms concatenates the defaults with the
    // custom list, so putting it in both would render two tiles with the
    // same name — reachable by deleting a default room and typing its
    // name again, which is a perfectly ordinary thing to do.
    const nextRooms = DEFAULT_ROOMS[r] ? customRooms : [...customRooms, r];
    const nextHidden = hiddenRooms.filter((h) => h !== r);
    setCustomRooms(nextRooms);
    setHiddenRooms(nextHidden);
    persist({ customRooms: nextRooms, hiddenRooms: nextHidden });
    markDirtyAndFlush('custom_rooms', r);
    // The unhide lives in room_meta, and deleting a default room is how
    // it got hidden in the first place. Without pushing this the server
    // keeps hidden=true, and the next bootstrap hides the room the user
    // just re-added right back out from under them.
    markDirtyAndFlush('room_meta', r);
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

      // rename_room() only *renames rows that exist*, and for a built-in
      // room none do — "Living room" has no custom_rooms row to rename
      // and no room_meta row to carry a hidden flag. Those two rows are
      // invented locally by the block above, so unless they're pushed the
      // server ends up with items sitting in a room it has no record of,
      // and every other device shows an orphaned room it can't display.
      //
      // Marking them dirty rather than adding another RPC reuses the
      // outbox's existing create-or-delete logic: each key is pushed as an
      // upsert or a delete depending on whether it's present in local
      // state, which is already exactly right for both directions of a
      // rename (default -> custom, custom -> default, custom -> custom).
      // Safe in either order against the RPC above — whichever lands
      // second sees the other's result and still converges.
      markDirtyAndFlush('custom_rooms', oldName);
      markDirtyAndFlush('custom_rooms', n);
      markDirtyAndFlush('room_meta', oldName);
      markDirtyAndFlush('room_meta', n);

      // Spots have the same problem one level down. The RPC moves
      // existing custom_spots rows across, but a default room's spots are
      // client-side constants with no rows at all — the block above copies
      // them into customSpots under the new name, and without pushing them
      // the new room would come back spotless on the next bootstrap.
      // Old-room keys are marked too so their rows are cleaned up; a
      // delete of something the RPC already renamed is a harmless no-op.
      spotsForRoom(oldName).forEach((s) => markDirtyAndFlush('custom_spots', spotKey(n, s)));
      (customSpots[oldName] ?? []).forEach((s) => markDirtyAndFlush('custom_spots', spotKey(oldName, s)));
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

  // Account deletion only. auth-store's session going null already hides
  // every household screen behind the sign-in guard, but this device's
  // AsyncStorage cache and outbox would otherwise survive that and could
  // leak the deleted account's household data into a later sign-in on the
  // same phone — a different account, or a fresh one after re-signup.
  // theme/roomSort are left alone: genuine per-device preferences, not
  // account data.
  const clearLocalData = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await clearOutboxState();
    await resetMigrationFlag();
    dataRef.current = { ...dataRef.current, items: [], customRooms: [], customSpots: {}, hiddenRooms: [], roomIcons: {} };
    setItems([]);
    setCustomRooms([]);
    setCustomSpots({});
    setHiddenRooms([]);
    setRoomIcons({});
  };

  // Wipe this device's cache whenever the signed-in user goes away or
  // changes. Sign-out used to leave everything behind, which mattered
  // because the incoming-changes path above is purely additive — a
  // bootstrap adds and updates rows the server has, but never removes
  // rows it doesn't. So the next account to sign in on this phone saw the
  // previous one's items sitting in the list, and editing one of them
  // marked it dirty and pushed it into the *new* account's household.
  //
  // Only fires on non-null -> (null | different user). A null -> user
  // transition is left alone deliberately: that's a first sign-in, and
  // the pre-Phase-4 local data it would delete is exactly what
  // migrateLegacyLocalData() is about to read.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (initializing) return;
    const currentUserId = session?.user.id ?? null;
    const previousUserId = lastUserIdRef.current;
    lastUserIdRef.current = currentUserId;

    // First settled observation of the session — nothing to compare to.
    if (previousUserId === undefined) return;
    if (previousUserId === null || previousUserId === currentUserId) return;

    clearLocalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, initializing]);

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
    clearLocalData,
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
