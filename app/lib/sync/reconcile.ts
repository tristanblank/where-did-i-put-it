import { getDirtyKeys, type OutboxTable } from './outbox';

// Drops any incoming row (from an initial fetch or a realtime event) whose
// local key is still pending an outbound push. This is the entire
// conflict-resolution story: an unsent local edit always wins over a
// stale echo of what the server had before; everything else about "who
// wins" between two already-pushed writes is decided server-side by
// updated_at (see the set_updated_at trigger in schema.sql).
export async function filterReconcilable<T>(
  table: OutboxTable,
  rows: T[],
  keyOf: (row: T) => string
): Promise<T[]> {
  const dirty = new Set(await getDirtyKeys(table));
  return rows.filter((row) => !dirty.has(keyOf(row)));
}
