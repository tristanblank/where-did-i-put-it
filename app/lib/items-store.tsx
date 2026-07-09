import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_ROOMS, ROOM_ICONS } from '@/constants/defaults';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
  toggleTheme: () => void;
  setRoomSort: (sort: RoomSort) => void;
};

const STORAGE_KEY = 'stasher:data';
const uid = () => Math.random().toString(36).slice(2, 10);

const ItemsContext = createContext<ItemsStore | null>(null);

export function ItemsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [customRooms, setCustomRooms] = useState<string[]>([]);
  const [customSpots, setCustomSpots] = useState<Record<string, string[]>>({});
  const [hiddenRooms, setHiddenRooms] = useState<string[]>([]);
  const [roomIcons, setRoomIcons] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>(systemScheme ?? 'light');
  const [roomSort, setRoomSortState] = useState<RoomSort>('count');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data: Partial<PersistedData> = JSON.parse(raw);
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
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, customSpots, customRooms, hiddenRooms, roomIcons, theme, roomSort, ...over })
    ).catch((e) => console.error('Save failed', e));
  };

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
    const next = [{ id: uid(), ...input, updatedAt: Date.now() }, ...items];
    setItems(next);
    persist({ items: next });
  };

  const updateItem = (id: string, input: NewItemInput) => {
    const next = items.map((i) => (i.id === id ? { ...i, ...input, updatedAt: Date.now() } : i));
    setItems(next);
    persist({ items: next });
  };

  const deleteItem = (id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    persist({ items: next });
  };

  const addRoom = (name: string) => {
    const r = name.trim();
    if (!r || allRooms.includes(r)) return;
    const nextRooms = [...customRooms, r];
    const nextHidden = hiddenRooms.filter((h) => h !== r);
    setCustomRooms(nextRooms);
    setHiddenRooms(nextHidden);
    persist({ customRooms: nextRooms, hiddenRooms: nextHidden });
  };

  const addSpot = (room: string, name: string) => {
    const s = name.trim();
    if (!s || !room || spotsForRoom(room).includes(s)) return;
    const nextSpots = { ...customSpots, [room]: [...(customSpots[room] ?? []), s] };
    setCustomSpots(nextSpots);
    persist({ customSpots: nextSpots });
  };

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
  };

  const setRoomIcon = (room: string, icon: string) => {
    const nextIcons = { ...roomIcons, [room]: icon };
    setRoomIcons(nextIcons);
    persist({ roomIcons: nextIcons });
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
