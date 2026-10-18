// Realtime sync core. No Supabase or React imports: the channel is injected so
// the mapping, batching and cleanup are unit-testable.

// Every wedding_* data table Wedding HQ reads (the subset in the realtime
// publication). wedding_guests / wedding_activity have no screen yet but are
// subscribed so their cache stays fresh once one exists.
export const REALTIME_TABLES = [
  'wedding_categories', 'wedding_budget_lines', 'wedding_quotes', 'wedding_vendors', 'wedding_invoices',
  'wedding_payments', 'wedding_savings', 'wedding_targets', 'wedding_tasks', 'wedding_events',
  'wedding_itinerary_days', 'wedding_purchase_items', 'wedding_bookings', 'wedding_packing_items',
  'wedding_travel_docs', 'wedding_guests', 'wedding_activity',
] as const;

// The wedding row itself (name, date, budget): has `id`, not `wedding_id`.
export const WEDDING_TABLE = 'wedding_weddings';

export type ChannelStatus = 'subscribed' | 'error' | 'closed';
export type SyncStatus = 'connecting' | 'live' | 'reconnecting';
export type QueryKeyLike = readonly string[];

export interface ChannelHandle {
  close(): void;
}

export interface ChannelArgs {
  weddingId: string;
  tables: readonly string[];
  onChange: (table: string) => void;
  onStatus: (status: ChannelStatus) => void;
}

export type ChannelFactory = (args: ChannelArgs) => ChannelHandle;

// The react-query key a change to `table` makes stale; null when we do not track it.
export function queryKeyFor(table: string, weddingId: string): QueryKeyLike | null {
  if (table === WEDDING_TABLE) return ['wedding-membership'];
  return (REALTIME_TABLES as readonly string[]).includes(table) ? [table, weddingId] : null;
}

// postgres_changes filter: every table is scoped to this wedding.
export function filterFor(table: string, weddingId: string): string {
  return table === WEDDING_TABLE ? `id=eq.${weddingId}` : `wedding_id=eq.${weddingId}`;
}

export interface SyncOptions {
  weddingId: string;
  createChannel: ChannelFactory;
  invalidate: (key: QueryKeyLike) => void;
  onStatus?: (status: SyncStatus) => void;
  debounceMs?: number;
  retryMs?: number;
}

const ALL_TABLES: readonly string[] = [...REALTIME_TABLES, WEDDING_TABLE];

// Starts listening; changes are batched into one invalidation per table per
// debounce window. Nothing here throws: a failing channel just reports
// "reconnecting" and is retried.
export function startRealtimeSync(opts: SyncOptions): { stop: () => void } {
  const { weddingId, createChannel, invalidate, onStatus } = opts;
  const debounceMs = opts.debounceMs ?? 300;
  const retryMs = opts.retryMs ?? 10_000;
  let stopped = false;
  let handle: ChannelHandle | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let everLive = false;
  let needsCatchUp = false;
  const pending = new Set<string>();

  const report = (s: SyncStatus) => {
    if (!stopped) onStatus?.(s);
  };

  const safeInvalidate = (table: string) => {
    const key = queryKeyFor(table, weddingId);
    if (!key) return;
    try {
      invalidate(key);
    } catch {
      /* a failed invalidation must never break the UI */
    }
  };

  const flush = () => {
    flushTimer = null;
    if (stopped) return;
    const tables = [...pending];
    pending.clear();
    tables.forEach(safeInvalidate);
  };

  const onChange = (table: string) => {
    if (stopped || !queryKeyFor(table, weddingId)) return;
    pending.add(table);
    if (flushTimer === null) flushTimer = setTimeout(flush, debounceMs);
  };

  const onChannelStatus = (status: ChannelStatus) => {
    if (stopped) return;
    if (status === 'subscribed') {
      report('live');
      // After a drop we may have missed events: refetch everything we track.
      if (everLive && needsCatchUp) ALL_TABLES.forEach(safeInvalidate);
      everLive = true;
      needsCatchUp = false;
    } else {
      needsCatchUp = true;
      report('reconnecting');
    }
  };

  const connect = () => {
    if (stopped) return;
    try {
      handle = createChannel({ weddingId, tables: ALL_TABLES, onChange, onStatus: onChannelStatus });
    } catch {
      needsCatchUp = true;
      report('reconnecting');
      retryTimer = setTimeout(connect, retryMs);
    }
  };

  report('connecting');
  connect();

  return {
    stop: () => {
      stopped = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      flushTimer = null;
      retryTimer = null;
      pending.clear();
      try {
        handle?.close();
      } catch {
        /* already closed */
      }
      handle = null;
    },
  };
}
