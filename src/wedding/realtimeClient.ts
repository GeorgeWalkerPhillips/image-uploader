import { supabase } from '../supabaseClient';
import { filterFor } from './lib/realtime';
import type { ChannelFactory, ChannelStatus } from './lib/realtime';

// The only place Wedding HQ opens a realtime channel. RLS still decides which
// rows a subscriber is sent, so this adds no access on its own. The topic is
// unique per start so a fast remount never collides with a channel that is
// still being torn down.
let channelSeq = 0;

export const supabaseChannelFactory: ChannelFactory = ({ weddingId, tables, onChange, onStatus }) => {
  let channel = supabase.channel(`wedding-hq:${weddingId}:${(channelSeq += 1)}`);
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: filterFor(table, weddingId) },
      () => onChange(table)
    );
  }
  channel.subscribe((status: string) => {
    const mapped: ChannelStatus = status === 'SUBSCRIBED' ? 'subscribed' : status === 'CLOSED' ? 'closed' : 'error';
    onStatus(mapped);
  });
  return {
    close: () => {
      void Promise.resolve(supabase.removeChannel(channel)).catch(() => undefined);
    },
  };
};
