import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase';

export type Member = {
  id: string;
  displayName: string | null;
};

// Everyone in the caller's household, for turning items.created_by into a
// name. Readable at all only because of the "household members read"
// policy — before that, profiles was own-row-only and created_by resolved
// to a row the reader couldn't see.
//
// Deliberately not in items-store: members change on the order of never
// (someone joins, someone renames themselves), so this doesn't need the
// realtime channel, the outbox, or the offline cache that items do. A
// fetch on mount with a manual refresh after a rename is the whole
// lifecycle.
export function useHouseholdMembers() {
  const { householdId, session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!householdId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('household_id', householdId);

    if (error) {
      console.error('Failed to load household members', error);
      setLoading(false);
      return;
    }
    setMembers((data ?? []).map((r) => ({ id: r.id, displayName: r.display_name })));
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Falls back to the uuid's first chunk rather than rendering a bare
  // null, and distinguishes the two ways a name can be missing: a member
  // who hasn't set one yet, versus a created_by pointing at someone who
  // has since left the household (still a valid profiles row, just not
  // one this reader can see any more).
  const nameFor = useCallback(
    (userId: string | null): string | null => {
      if (!userId) return null;
      if (userId === session?.user.id) return 'you';
      const match = members.find((m) => m.id === userId);
      if (!match) return 'Someone who left';
      return match.displayName?.trim() || 'Unnamed member';
    },
    [members, session?.user.id]
  );

  return { members, loading, refresh, nameFor };
}
