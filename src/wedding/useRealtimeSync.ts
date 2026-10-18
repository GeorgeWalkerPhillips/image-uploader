import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { startRealtimeSync } from './lib/realtime';
import type { SyncStatus } from './lib/realtime';
import { supabaseChannelFactory } from './realtimeClient';
import { useOnline } from './useOnline';
import { useWedding } from './WeddingContext';

export type ConnectionState = SyncStatus | 'offline';

// Live-syncs this wedding's tables into the query cache while mounted, and
// removes the channel on unmount (which includes sign-out).
export function useRealtimeSync(): ConnectionState {
  const { wedding } = useWedding();
  const qc = useQueryClient();
  const online = useOnline();
  const [status, setStatus] = useState<SyncStatus>('connecting');

  useEffect(() => {
    const sync = startRealtimeSync({
      weddingId: wedding.id,
      createChannel: supabaseChannelFactory,
      invalidate: (queryKey) => void qc.invalidateQueries({ queryKey }),
      onStatus: setStatus,
    });
    return sync.stop;
  }, [wedding.id, qc]);

  return online ? status : 'offline';
}
