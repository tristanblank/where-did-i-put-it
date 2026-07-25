import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type ItemRow = {
  id: string;
  household_id: string;
  name: string;
  room: string;
  spot: string | null;
  pos: string | null;
  container: string | null;
  note: string | null;
  created_by: string | null;
  updated_at: string;
};

export type CustomRoomRow = { household_id: string; name: string; updated_at: string };
export type CustomSpotRow = { household_id: string; room: string; name: string; updated_at: string };
export type RoomMetaRow = { household_id: string; room: string; icon: string | null; hidden: boolean; updated_at: string };

type Handlers = {
  onItems: (payload: RealtimePostgresChangesPayload<ItemRow>) => void;
  onCustomRooms: (payload: RealtimePostgresChangesPayload<CustomRoomRow>) => void;
  onCustomSpots: (payload: RealtimePostgresChangesPayload<CustomSpotRow>) => void;
  onRoomMeta: (payload: RealtimePostgresChangesPayload<RoomMetaRow>) => void;
};

// One channel per household, covering all four synced tables. Filtering by
// household_id here is a performance optimization, not the security
// boundary — RLS (already scoped via my_household_id() in schema.sql) is
// what actually prevents cross-household reads; postgres_changes respects
// RLS using the subscriber's own JWT regardless of this filter.
export function subscribeToHousehold(householdId: string, handlers: Handlers): RealtimeChannel {
  const filter = `household_id=eq.${householdId}`;
  return supabase
    .channel(`household:${householdId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter }, handlers.onItems)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_rooms', filter }, handlers.onCustomRooms)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_spots', filter }, handlers.onCustomSpots)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_meta', filter }, handlers.onRoomMeta)
    .subscribe();
}
